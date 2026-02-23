package invites

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	mw "github.com/clk-66/spectrus/internal/middleware"
	"github.com/clk-66/spectrus/internal/permissions"
)

type Handler struct {
	db  *sql.DB
	svc *Service
}

func NewHandler(db *sql.DB, svc *Service) *Handler {
	return &Handler{db: db, svc: svc}
}

// POST /invites
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.InvitesCreate); err != nil {
		writePerm(w, err)
		return
	}

	var body struct {
		ChannelID *string    `json:"channel_id"`
		MaxUses   int        `json:"max_uses"`
		ExpiresAt *time.Time `json:"expires_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	invite, err := h.svc.CreateInvite(r.Context(), CreateInviteInput{
		CreatorID: userID,
		ChannelID: body.ChannelID,
		MaxUses:   body.MaxUses,
		ExpiresAt: body.ExpiresAt,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create invite")
		return
	}

	writeJSON(w, http.StatusCreated, invite)
}

// GET /invites/:token — public, no auth required.
// Returns server metadata + invite info for the join-preview screen.
func (h *Handler) GetPreview(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	preview, err := h.svc.GetPreview(r.Context(), token)
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch invite")
		return
	}

	writeJSON(w, http.StatusOK, preview)
}

// POST /invites/:token/use — authenticated.
// Adds the calling user as a member. Fails gracefully for all invalid states.
func (h *Handler) Use(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	token := chi.URLParam(r, "token")

	err := h.svc.UseInvite(r.Context(), token, userID)
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, ErrAlreadyMember):
		writeError(w, http.StatusConflict, "already a member of this server")
	case errors.Is(err, ErrExpired):
		writeError(w, http.StatusGone, "invite has expired")
	case errors.Is(err, ErrExhausted):
		writeError(w, http.StatusGone, "invite has reached its use limit")
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "invite not found")
	default:
		writeError(w, http.StatusInternalServerError, "failed to use invite")
	}
}

// GET /invites — authenticated, requires invites:create permission.
// Lists all invites on this server.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.InvitesCreate); err != nil {
		writePerm(w, err)
		return
	}

	invites, err := h.svc.ListInvites(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list invites")
		return
	}
	writeJSON(w, http.StatusOK, invites)
}

// DELETE /invites/:token — authenticated, requires invites:create permission.
// Revokes (deletes) the invite so it can no longer be used.
func (h *Handler) Revoke(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.InvitesCreate); err != nil {
		writePerm(w, err)
		return
	}

	token := chi.URLParam(r, "token")
	err := h.svc.RevokeInvite(r.Context(), token)
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "invite not found")
	default:
		writeError(w, http.StatusInternalServerError, "failed to revoke invite")
	}
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

func writePerm(w http.ResponseWriter, err error) {
	var forbidden permissions.ErrForbidden
	if errors.As(err, &forbidden) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	writeError(w, http.StatusInternalServerError, "permission check failed")
}
