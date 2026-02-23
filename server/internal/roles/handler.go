package roles

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/clk-66/spectrus/internal/hub"
	mw "github.com/clk-66/spectrus/internal/middleware"
	"github.com/clk-66/spectrus/internal/permissions"
)

type Handler struct {
	db  *sql.DB
	svc *Service
	hub *hub.Hub
}

func NewHandler(db *sql.DB, svc *Service, h *hub.Hub) *Handler {
	return &Handler{db: db, svc: svc, hub: h}
}

// GET /roles
func (h *Handler) ListRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.svc.ListRoles(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list roles")
		return
	}
	writeJSON(w, http.StatusOK, roles)
}

// POST /roles
func (h *Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.RolesM); err != nil {
		writePerm(w, err)
		return
	}

	var body struct {
		Name        string   `json:"name"`
		Color       int      `json:"color"`
		Position    int      `json:"position"`
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if err := validatePerms(body.Permissions); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	role, err := h.svc.CreateRole(r.Context(), CreateRoleInput{
		Name:        body.Name,
		Color:       body.Color,
		Position:    body.Position,
		Permissions: body.Permissions,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create role")
		return
	}

	h.hub.Broadcast(hub.Envelope{Type: hub.EventRoleUpdate, Payload: role})
	writeJSON(w, http.StatusCreated, role)
}

// PATCH /roles/{id}
func (h *Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.RolesM); err != nil {
		writePerm(w, err)
		return
	}

	id := chi.URLParam(r, "id")

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var in UpdateRoleInput

	if v, ok := raw["name"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			in.Name = &s
		}
	}
	if v, ok := raw["color"]; ok {
		var n int
		if err := json.Unmarshal(v, &n); err == nil {
			in.Color = &n
		}
	}
	if v, ok := raw["permissions"]; ok && string(v) != "null" {
		var perms []string
		if err := json.Unmarshal(v, &perms); err != nil {
			writeError(w, http.StatusBadRequest, "permissions must be an array of strings")
			return
		}
		if err := validatePerms(perms); err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		in.Permissions = &perms
	}

	role, err := h.svc.UpdateRole(r.Context(), id, in)
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update role")
		return
	}

	h.hub.Broadcast(hub.Envelope{Type: hub.EventRoleUpdate, Payload: role})
	writeJSON(w, http.StatusOK, role)
}

// DELETE /roles/{id}
func (h *Handler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.RolesM); err != nil {
		writePerm(w, err)
		return
	}

	id := chi.URLParam(r, "id")
	err := h.svc.DeleteRole(r.Context(), id)

	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "role not found")
	case errors.Is(err, ErrRoleInUse):
		writeError(w, http.StatusConflict, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "failed to delete role")
	default:
		h.hub.Broadcast(hub.Envelope{
			Type:    hub.EventRoleUpdate,
			Payload: map[string]any{"deleted": true, "role_id": id},
		})
		w.WriteHeader(http.StatusNoContent)
	}
}

// POST /members/{user_id}/roles/{role_id}
func (h *Handler) AssignRole(w http.ResponseWriter, r *http.Request) {
	callerID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, callerID, permissions.RolesM); err != nil {
		writePerm(w, err)
		return
	}

	targetUserID := chi.URLParam(r, "user_id")
	roleID := chi.URLParam(r, "role_id")

	if err := h.svc.AssignRole(r.Context(), targetUserID, roleID); err != nil {
		switch {
		case errors.Is(err, ErrNotMember):
			writeError(w, http.StatusNotFound, "user is not a member of this server")
		case errors.Is(err, ErrNotFound):
			writeError(w, http.StatusNotFound, "role not found")
		default:
			writeError(w, http.StatusInternalServerError, "failed to assign role")
		}
		return
	}

	h.broadcastMemberUpdate(r, targetUserID)
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /members/{user_id}/roles/{role_id}
func (h *Handler) RemoveRole(w http.ResponseWriter, r *http.Request) {
	callerID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, callerID, permissions.RolesM); err != nil {
		writePerm(w, err)
		return
	}

	targetUserID := chi.URLParam(r, "user_id")
	roleID := chi.URLParam(r, "role_id")

	if err := h.svc.RemoveRole(r.Context(), targetUserID, roleID); err != nil {
		switch {
		case errors.Is(err, ErrNotMember):
			writeError(w, http.StatusNotFound, "user is not a member of this server")
		case errors.Is(err, ErrNotFound):
			writeError(w, http.StatusNotFound, "role not found")
		default:
			writeError(w, http.StatusInternalServerError, "failed to remove role")
		}
		return
	}

	h.broadcastMemberUpdate(r, targetUserID)
	w.WriteHeader(http.StatusNoContent)
}

// GET /members
func (h *Handler) ListMembers(w http.ResponseWriter, r *http.Request) {
	members, err := h.svc.ListMembers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	writeJSON(w, http.StatusOK, members)
}

// ---- Helpers -------------------------------------------------------------

// broadcastMemberUpdate fetches the updated member and fires MEMBER_UPDATE.
// Non-fatal: a broadcast failure must not affect the HTTP response.
func (h *Handler) broadcastMemberUpdate(r *http.Request, userID string) {
	member, err := h.svc.GetMember(r.Context(), userID)
	if err != nil {
		return
	}
	h.hub.Broadcast(hub.Envelope{Type: hub.EventMemberUpdate, Payload: member})
}

// validatePerms checks that every string in the slice is a known Permission.
func validatePerms(perms []string) error {
	for _, p := range perms {
		if !permissions.Valid(permissions.Permission(p)) {
			return &unknownPermError{p}
		}
	}
	return nil
}

type unknownPermError struct{ perm string }

func (e *unknownPermError) Error() string {
	return "unknown permission: " + e.perm
}

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
