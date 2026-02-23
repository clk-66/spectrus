package hub

import (
	"context"
	"encoding/json"
	"log/slog"
)

// IncomingEnvelope is the wire format for client → server WebSocket messages.
type IncomingEnvelope struct {
	Op      string          `json:"op"`
	Payload json.RawMessage `json:"d"`
}

// Incoming op-codes sent by the client.
const (
	OpVoiceStateUpdate = "VOICE_STATE_UPDATE"
	OpVoiceSignal      = "VOICE_SIGNAL"
	OpPluginEvent      = "PLUGIN_EVENT"
	OpTypingStart      = "TYPING_START"
)

type incomingPluginEvent struct {
	PluginID string          `json:"plugin_id"`
	Payload  json.RawMessage `json:"payload"`
}

type incomingTypingStart struct {
	ChannelID string `json:"channel_id"`
	Username  string `json:"username"`
}

type incomingVoiceState struct {
	ChannelID *string `json:"channel_id"` // null = leave all voice channels
}

type incomingVoiceSignal struct {
	ChannelID string          `json:"channel_id"`
	Type      string          `json:"type"` // offer | answer | candidate
	Data      json.RawMessage `json:"data"` // SDP string or RTCIceCandidate object
}

// handleMessage parses a raw WebSocket frame and dispatches to the appropriate handler.
// Called synchronously from readPump — media calls are dispatched into goroutines.
func (c *Client) handleMessage(raw []byte) {
	var msg IncomingEnvelope
	if err := json.Unmarshal(raw, &msg); err != nil {
		slog.Warn("ws bad message", "user_id", c.UserID, "err", err)
		return
	}

	switch msg.Op {
	case OpVoiceStateUpdate:
		c.handleVoiceStateUpdate(msg.Payload)
	case OpVoiceSignal:
		c.handleVoiceSignal(msg.Payload)
	case OpPluginEvent:
		c.handlePluginEvent(msg.Payload)
	case OpTypingStart:
		c.handleTypingStart(msg.Payload)
	default:
		slog.Debug("ws unknown op", "op", msg.Op, "user_id", c.UserID)
	}
}

// handleVoiceStateUpdate processes a client joining or leaving a voice channel.
//
//   Join:  {"op":"VOICE_STATE_UPDATE","d":{"channel_id":"<id>"}}
//   Leave: {"op":"VOICE_STATE_UPDATE","d":{"channel_id":null}}
func (c *Client) handleVoiceStateUpdate(raw json.RawMessage) {
	var payload incomingVoiceState
	if err := json.Unmarshal(raw, &payload); err != nil {
		return
	}

	h := c.hub

	if payload.ChannelID == nil {
		// ---- Leave --------------------------------------------------------
		channelID, was := h.LeaveVoiceChannel(c.UserID)
		if !was {
			return
		}

		if h.media != nil {
			chID, uid := channelID, c.UserID
			go func() {
				if err := h.media.Leave(context.Background(), chID, uid); err != nil {
					slog.Warn("media leave failed", "user_id", uid, "channel_id", chID, "err", err)
				}
			}()
		}

		h.Broadcast(Envelope{
			Type:    EventVoiceStateUpdate,
			Payload: map[string]any{"user_id": c.UserID, "channel_id": nil},
		})
		return
	}

	// ---- Join (or switch) -------------------------------------------------
	newChannelID := *payload.ChannelID
	prevChannelID := h.JoinVoiceChannel(c.UserID, newChannelID)

	// Tell mediasoup to leave the old channel when the user switches.
	if prevChannelID != "" && prevChannelID != newChannelID && h.media != nil {
		prev, uid := prevChannelID, c.UserID
		go func() {
			if err := h.media.Leave(context.Background(), prev, uid); err != nil {
				slog.Warn("media leave (channel switch) failed", "user_id", uid, "err", err)
			}
		}()
	}

	// Tell mediasoup about the join; forward its response to the joining client.
	if h.media != nil {
		chID, uid := newChannelID, c.UserID
		go func() {
			defer func() { recover() }() // guard against send-on-closed-channel if client disconnects mid-join

			resp, err := h.media.Join(context.Background(), chID, uid)
			if err != nil {
				slog.Warn("media join failed", "user_id", uid, "channel_id", chID, "err", err)
				return
			}
			if resp != nil {
				c.sendEvent(Envelope{
					Type: EventVoiceSignal,
					Payload: map[string]any{
						"type":       "join_response",
						"channel_id": chID,
						"data":       resp,
					},
				})
			}
		}()
	}

	// Broadcast the new voice state so all clients update their UI.
	h.Broadcast(Envelope{
		Type:    EventVoiceStateUpdate,
		Payload: map[string]any{"user_id": c.UserID, "channel_id": newChannelID},
	})
}

// handleVoiceSignal forwards a signaling message (offer/answer/ICE candidate)
// from the client to mediasoup and relays any response back to the same client.
//
//	{"op":"VOICE_SIGNAL","d":{"channel_id":"<id>","type":"offer","data":{...}}}
func (c *Client) handleVoiceSignal(raw json.RawMessage) {
	var payload incomingVoiceSignal
	if err := json.Unmarshal(raw, &payload); err != nil {
		return
	}
	if payload.ChannelID == "" || payload.Type == "" {
		return
	}

	h := c.hub
	if h.media == nil {
		return
	}

	// Only forward if the sender is actually in the claimed channel.
	// This prevents a client from injecting signals into rooms they don't belong to.
	if ch, ok := h.VoiceChannelOf(c.UserID); !ok || ch != payload.ChannelID {
		slog.Warn("voice signal rejected: user not in channel",
			"user_id", c.UserID,
			"claimed_channel", payload.ChannelID,
		)
		return
	}

	signalJSON, err := json.Marshal(map[string]any{
		"type": payload.Type,
		"data": payload.Data,
	})
	if err != nil {
		return
	}

	chID, uid := payload.ChannelID, c.UserID
	go func() {
		defer func() { recover() }() // guard against send-on-closed-channel

		resp, err := h.media.Signal(context.Background(), chID, uid, signalJSON)
		if err != nil {
			slog.Warn("media signal failed", "user_id", uid, "type", payload.Type, "err", err)
			return
		}
		if resp != nil {
			c.sendEvent(Envelope{
				Type: EventVoiceSignal,
				Payload: map[string]any{
					"type":       payload.Type + "_response",
					"channel_id": chID,
					"data":       resp,
				},
			})
		}
	}()
}

// handleTypingStart broadcasts a TYPING_START notification to all clients so they
// can show typing indicators.
//
//	{"op":"TYPING_START","d":{"channel_id":"<id>","username":"alice"}}
func (c *Client) handleTypingStart(raw json.RawMessage) {
	var payload incomingTypingStart
	if err := json.Unmarshal(raw, &payload); err != nil || payload.ChannelID == "" {
		return
	}
	c.hub.Broadcast(Envelope{
		Type: EventTypingStart,
		Payload: map[string]any{
			"user_id":    c.UserID,
			"channel_id": payload.ChannelID,
			"username":   payload.Username,
		},
	})
}

// handlePluginEvent broadcasts a PLUGIN_EVENT from a client to all connected clients.
// For MVP this is a simple fan-out — actual plugin execution is deferred to post-MVP.
//
//	{"op":"PLUGIN_EVENT","d":{"plugin_id":"com.example.myplugin","payload":{...}}}
func (c *Client) handlePluginEvent(raw json.RawMessage) {
	var event incomingPluginEvent
	if err := json.Unmarshal(raw, &event); err != nil || event.PluginID == "" {
		return
	}
	c.hub.Broadcast(Envelope{
		Type: EventPluginEvent,
		Payload: map[string]any{
			"plugin_id": event.PluginID,
			"payload":   event.Payload,
		},
	})
}
