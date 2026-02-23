package channels

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/clk-66/spectrus/internal/hub"
	mw "github.com/clk-66/spectrus/internal/middleware"
	"github.com/clk-66/spectrus/internal/permissions"
)

// Handler wires HTTP requests to the channels Service.
type Handler struct {
	db  *sql.DB
	svc *Service
	hub *hub.Hub
}

func NewHandler(db *sql.DB, svc *Service, h *hub.Hub) *Handler {
	return &Handler{db: db, svc: svc, hub: h}
}

// ---- Categories ----------------------------------------------------------

// GET /categories
func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	cats, uncategorized, err := h.svc.ListCategoriesWithChannels(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list categories")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"categories":   cats,
		"uncategorized": uncategorized,
	})
}

// POST /categories
func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.CategoriesM); err != nil {
		writePerm(w, err)
		return
	}

	var body struct {
		Name     string `json:"name"`
		Position int    `json:"position"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	cat, err := h.svc.CreateCategory(r.Context(), body.Name, body.Position)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create category")
		return
	}

	h.hub.Broadcast(hub.Envelope{Type: hub.EventChannelCreate, Payload: map[string]any{"category": cat}})
	writeJSON(w, http.StatusCreated, cat)
}

// ---- Channels ------------------------------------------------------------

// POST /channels
func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.ChannelsM); err != nil {
		writePerm(w, err)
		return
	}

	var body struct {
		CategoryID *string `json:"category_id"`
		Name       string  `json:"name"`
		Type       string  `json:"type"`
		Position   int     `json:"position"`
		Topic      *string `json:"topic"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	if body.Type != "text" && body.Type != "voice" {
		writeError(w, http.StatusUnprocessableEntity, `type must be "text" or "voice"`)
		return
	}

	ch, err := h.svc.CreateChannel(r.Context(), CreateChannelInput{
		CategoryID: body.CategoryID,
		Name:       body.Name,
		Type:       body.Type,
		Position:   body.Position,
		Topic:      body.Topic,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create channel")
		return
	}

	h.hub.Broadcast(hub.Envelope{Type: hub.EventChannelCreate, Payload: map[string]any{"channel": ch}})
	writeJSON(w, http.StatusCreated, ch)
}

// PATCH /channels/{id}
func (h *Handler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.ChannelsM); err != nil {
		writePerm(w, err)
		return
	}

	id := chi.URLParam(r, "id")

	// Decode into a raw map first so we only touch fields that are present.
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var in UpdateChannelInput
	if v, ok := raw["name"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			in.Name = &s
		}
	}
	if v, ok := raw["category_id"]; ok {
		var s string
		// Explicit JSON null → empty string → clears category in service layer.
		if string(v) == "null" {
			empty := ""
			in.CategoryID = &empty
		} else if err := json.Unmarshal(v, &s); err == nil {
			in.CategoryID = &s
		}
	}
	if v, ok := raw["position"]; ok {
		var n int
		if err := json.Unmarshal(v, &n); err == nil {
			in.Position = &n
		}
	}
	if v, ok := raw["topic"]; ok {
		var s string
		if string(v) == "null" {
			empty := ""
			in.Topic = &empty
		} else if err := json.Unmarshal(v, &s); err == nil {
			in.Topic = &s
		}
	}

	ch, err := h.svc.UpdateChannel(r.Context(), id, in)
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update channel")
		return
	}

	h.hub.Broadcast(hub.Envelope{Type: hub.EventChannelUpdate, Payload: map[string]any{"channel": ch}})
	writeJSON(w, http.StatusOK, ch)
}

// DELETE /channels/{id}
func (h *Handler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.ChannelsM); err != nil {
		writePerm(w, err)
		return
	}

	id := chi.URLParam(r, "id")
	err := h.svc.DeleteChannel(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete channel")
		return
	}

	h.hub.Broadcast(hub.Envelope{Type: hub.EventChannelDelete, Payload: map[string]any{"channel_id": id}})
	w.WriteHeader(http.StatusNoContent)
}

// ---- Messages ------------------------------------------------------------

// GET /channels/{id}/messages?before=<cursor>&limit=<n>
func (h *Handler) ListMessages(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "id")

	before := r.URL.Query().Get("before")
	limit := defaultLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}

	page, err := h.svc.ListMessages(r.Context(), channelID, before, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch messages")
		return
	}
	writeJSON(w, http.StatusOK, page)
}

// POST /channels/{id}/messages
func (h *Handler) CreateMessage(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.MessagesS); err != nil {
		writePerm(w, err)
		return
	}

	channelID := chi.URLParam(r, "id")

	ok, err := h.svc.ChannelExists(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify channel")
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}

	msg, err := h.svc.CreateMessage(r.Context(), channelID, userID, body.Content)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to send message")
		return
	}

	h.hub.Broadcast(hub.Envelope{
		Type: hub.EventMessageCreate,
		Payload: map[string]any{
			"channel_id": channelID,
			"message":    msg,
		},
	})

	writeJSON(w, http.StatusCreated, msg)
}

// ---- Helpers -------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// writePerm writes a 403 for ErrForbidden or 500 for DB errors.
func writePerm(w http.ResponseWriter, err error) {
	var forbidden permissions.ErrForbidden
	if errors.As(err, &forbidden) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	writeError(w, http.StatusInternalServerError, "permission check failed")
}
