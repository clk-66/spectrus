package plugins

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	mw "github.com/clk-66/spectrus/internal/middleware"
	"github.com/clk-66/spectrus/internal/permissions"
)

// Handler wires HTTP requests to the plugins Service.
type Handler struct {
	db  *sql.DB
	svc *Service
}

func NewHandler(db *sql.DB, svc *Service) *Handler {
	return &Handler{db: db, svc: svc}
}

// GET /plugins
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	plugins, err := h.svc.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list plugins")
		return
	}
	writeJSON(w, http.StatusOK, plugins)
}

// POST /plugins
// Body: { "repo_url": "https://github.com/owner/repo" }
func (h *Handler) Install(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.PluginsM); err != nil {
		writePerm(w, err)
		return
	}

	var body struct {
		RepoURL string `json:"repo_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RepoURL == "" {
		writeError(w, http.StatusBadRequest, "repo_url is required")
		return
	}

	plugin, err := h.svc.Install(r.Context(), body.RepoURL)
	if err != nil {
		switch {
		case errors.Is(err, ErrDuplicateRepo):
			writeError(w, http.StatusConflict, err.Error())
		case errors.Is(err, ErrInvalidManifest):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusBadGateway, "failed to fetch or install plugin")
		}
		return
	}

	writeJSON(w, http.StatusCreated, plugin)
}

// PATCH /plugins/{id}
// Body: { "enabled": true }
func (h *Handler) SetEnabled(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.PluginsM); err != nil {
		writePerm(w, err)
		return
	}

	id := chi.URLParam(r, "id")

	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	plugin, err := h.svc.SetEnabled(r.Context(), id, body.Enabled)
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "plugin not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update plugin")
		return
	}

	writeJSON(w, http.StatusOK, plugin)
}

// DELETE /plugins/{id}
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := mw.GetUserID(r.Context())
	if err := permissions.RequirePermission(h.db, userID, permissions.PluginsM); err != nil {
		writePerm(w, err)
		return
	}

	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, http.StatusNotFound, "plugin not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete plugin")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ---- Helpers -------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
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
