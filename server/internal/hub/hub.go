package hub

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/gorilla/websocket"

	"github.com/clk-66/spectrus/internal/media"
)

// Hub maintains the set of active WebSocket clients and routes broadcasts.
//
// Client registration/unregistration and event broadcasting happen on the
// single Run() goroutine — no locks needed for those fields.
//
// Voice state is accessed from many readPump goroutines concurrently, so it
// is protected by voiceMu separately.
type Hub struct {
	upgrader websocket.Upgrader

	// Event-loop fields — only touched inside Run().
	clients    map[*Client]struct{}
	userIndex  map[string][]*Client // userID → all connections (multi-tab support)
	broadcast  chan Envelope
	register   chan *Client
	unregister chan *Client

	// Voice state — protected by voiceMu.
	voiceMu    sync.RWMutex
	voiceState map[string]map[string]struct{} // channelID → set of userIDs
	userVoice  map[string]string              // userID → current channelID

	// mediasoup HTTP client — may be nil if media service is unconfigured.
	media *media.Client
}

func NewHub(domain string, mediaClient *media.Client) *Hub {
	h := &Hub{
		clients:    make(map[*Client]struct{}),
		userIndex:  make(map[string][]*Client),
		broadcast:  make(chan Envelope, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		voiceState: make(map[string]map[string]struct{}),
		userVoice:  make(map[string]string),
		media:      mediaClient,
	}
	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     makeCheckOrigin(domain),
	}
	return h
}

// makeCheckOrigin returns a gorilla/websocket CheckOrigin function that allows
// upgrades only from origins whose hostname matches the configured domain.
//
// Rules:
//   - Empty domain → allow all origins and log a one-time startup warning.
//   - Matching domain hostname → allowed.
//   - localhost / 127.0.0.1 / tauri.localhost → always allowed so that the
//     Tauri desktop app and local dev tooling work regardless of domain config.
//   - Origin: null → allowed (some Tauri / custom-protocol webviews send this).
//   - Missing Origin header → allowed (non-browser / native clients).
//   - Anything else → rejected with a Warn-level log entry.
func makeCheckOrigin(domain string) func(*http.Request) bool {
	if domain == "" {
		slog.Warn("SPECTRUS_DOMAIN is not set — WebSocket origin check is disabled; set it in production")
		return func(r *http.Request) bool { return true }
	}

	allowed := normaliseHost(domain)

	return func(r *http.Request) bool {
		origin := r.Header.Get("Origin")

		// No header: non-browser client (e.g. native app, server-to-server). Allow.
		if origin == "" {
			return true
		}

		// "null" is sent by some Tauri builds when the webview uses a custom
		// URI scheme (tauri://, asset://) that the browser treats as opaque.
		if origin == "null" {
			return true
		}

		u, err := url.Parse(origin)
		if err != nil {
			slog.Warn("ws upgrade rejected: malformed Origin header", "origin", origin)
			return false
		}

		h := normaliseHost(u.Hostname())

		// Exact match against the configured domain.
		if h == allowed {
			return true
		}

		// Always allow localhost variants so Tauri dev and local tooling work.
		if h == "localhost" || h == "127.0.0.1" || h == "tauri.localhost" {
			return true
		}

		slog.Warn("ws upgrade rejected: origin not allowed",
			"origin", origin,
			"allowed_domain", allowed,
		)
		return false
	}
}

// normaliseHost strips an optional scheme and port from a host string and
// lowercases the result, making it safe to compare against SPECTRUS_DOMAIN
// regardless of how the operator wrote it.
func normaliseHost(h string) string {
	h = strings.TrimPrefix(strings.TrimPrefix(strings.ToLower(h), "https://"), "http://")
	if host, _, err := net.SplitHostPort(h); err == nil {
		return host
	}
	return h
}

// Run is the hub's event loop. Call once in a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.clients[c] = struct{}{}
			h.userIndex[c.UserID] = append(h.userIndex[c.UserID], c)
			slog.Info("ws connected", "user_id", c.UserID, "total", len(h.clients))

		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				h.removeFromUserIndex(c)
				close(c.send)
				slog.Info("ws disconnected", "user_id", c.UserID, "total", len(h.clients))

				// If the client was in a voice channel, clean up and notify others.
				// We fan out directly here rather than re-sending to h.broadcast to
				// avoid a potential deadlock if the broadcast buffer is full.
				if channelID, was := h.LeaveVoiceChannel(c.UserID); was {
					if h.media != nil {
						chID, uid := channelID, c.UserID
						go func() {
							if err := h.media.Leave(context.Background(), chID, uid); err != nil {
								slog.Warn("media leave on disconnect", "user_id", uid, "channel_id", chID, "err", err)
							}
						}()
					}
					evt := Envelope{
						Type:    EventVoiceStateUpdate,
						Payload: map[string]any{"user_id": c.UserID, "channel_id": nil},
					}
					for client := range h.clients {
						client.sendEvent(evt)
					}
				}
			}

		case evt := <-h.broadcast:
			for c := range h.clients {
				c.sendEvent(evt)
			}
		}
	}
}

// Broadcast sends an event to every connected client.
func (h *Hub) Broadcast(evt Envelope) {
	h.broadcast <- evt
}

// SendToUser sends an event to all connections belonging to a specific user.
func (h *Hub) SendToUser(userID string, evt Envelope) {
	for _, c := range h.userIndex[userID] {
		c.sendEvent(evt)
	}
}

// ServeWS upgrades an HTTP connection to WebSocket and registers the client.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, userID string) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("ws upgrade failed", "err", err)
		return
	}
	c := newClient(h, conn, userID)
	h.register <- c
	go c.writePump()
	go c.readPump()
}

func (h *Hub) removeFromUserIndex(target *Client) {
	conns := h.userIndex[target.UserID]
	filtered := conns[:0]
	for _, c := range conns {
		if c != target {
			filtered = append(filtered, c)
		}
	}
	if len(filtered) == 0 {
		delete(h.userIndex, target.UserID)
	} else {
		h.userIndex[target.UserID] = filtered
	}
}
