package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"strings"

	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/go-chi/chi/v5"

	"github.com/clk-66/spectrus/internal/auth"
	"github.com/clk-66/spectrus/internal/channels"
	"github.com/clk-66/spectrus/internal/config"
	"github.com/clk-66/spectrus/internal/db"
	"github.com/clk-66/spectrus/internal/hub"
	"github.com/clk-66/spectrus/internal/invites"
	"github.com/clk-66/spectrus/internal/license"
	"github.com/clk-66/spectrus/internal/media"
	mw "github.com/clk-66/spectrus/internal/middleware"
	"github.com/clk-66/spectrus/internal/permissions"
	"github.com/clk-66/spectrus/internal/plugins"
	"github.com/clk-66/spectrus/internal/roles"
)

//go:embed all:client/dist
var clientDist embed.FS

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg := config.Load()
	if cfg.JWTSecret == "" {
		slog.Error("SPECTRUS_JWT_SECRET must be set")
		os.Exit(1)
	}

	database, err := db.Open(cfg.DBPath)
	if err != nil {
		slog.Error("open database", "err", err)
		os.Exit(1)
	}
	defer database.Close()

	lic := license.NewChecker(cfg.LicenseKey, cfg.KeygenAccountID, database, cfg.DBPath)
	lic.Start()

	mediaClient := media.NewClient(cfg.MediaURL)

	wsHub := hub.NewHub(cfg.Domain, mediaClient)
	go wsHub.Run()

	authSvc := auth.NewService(database, cfg.JWTSecret, cfg.AccessTokenTTL, cfg.RefreshTokenTTL)
	authHandler := auth.NewHandler(authSvc)

	channelsSvc := channels.NewService(database)
	channelsHandler := channels.NewHandler(database, channelsSvc, wsHub)

	invitesSvc := invites.NewService(database)
	invitesHandler := invites.NewHandler(database, invitesSvc)

	rolesSvc := roles.NewService(database)
	if err := rolesSvc.SeedDefaults(context.Background()); err != nil {
		slog.Error("seed default roles", "err", err)
		os.Exit(1)
	}
	rolesHandler := roles.NewHandler(database, rolesSvc, wsHub)

	pluginsSvc := plugins.NewService(database)
	pluginsHandler := plugins.NewHandler(database, pluginsSvc)

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	// Health probe — no auth; polled by Docker HEALTHCHECK and load balancers
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true}) //nolint:errcheck
	})

	// Public auth endpoints
	r.Post("/auth/register", authHandler.Register)
	r.Post("/auth/login", authHandler.Login)
	r.Post("/auth/refresh", authHandler.Refresh)

	// Public invite preview — no auth (called before the user has an account)
	r.Get("/invites/{token}", invitesHandler.GetPreview)

	// WebSocket upgrade — outside the auth middleware group because browsers
	// cannot set custom headers on WS upgrade requests. The token is passed
	// as a ?token= query param and validated here directly.
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		claims, err := auth.ValidateAccessToken(token, cfg.JWTSecret)
		if err != nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		wsHub.ServeWS(w, r, claims.UserID)
	})

	// Protected endpoints
	r.Group(func(r chi.Router) {
		r.Use(mw.Auth(cfg.JWTSecret))

		// Server metadata
		r.Get("/servers/@me", func(w http.ResponseWriter, r *http.Request) {
			var name string
			if err := database.QueryRowContext(r.Context(),
				`SELECT COALESCE(name,'My Spectrus Server') FROM servers WHERE id='main'`,
			).Scan(&name); err != nil {
				name = "My Spectrus Server"
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"name": name}) //nolint:errcheck
		})

		// Server settings (admin)
		r.Get("/admin/settings", func(w http.ResponseWriter, r *http.Request) {
			var name, icon, banner string
			database.QueryRowContext(r.Context(), //nolint:errcheck
				`SELECT COALESCE(name,''), COALESCE(icon,''), COALESCE(banner,'') FROM servers WHERE id='main'`,
			).Scan(&name, &icon, &banner)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"name": name, "icon": icon, "banner": banner}) //nolint:errcheck
		})

		r.Patch("/admin/settings", func(w http.ResponseWriter, r *http.Request) {
			userID := mw.GetUserID(r.Context())
			if err := permissions.RequirePermission(database, userID, permissions.ServerM); err != nil {
				var forbidden permissions.ErrForbidden
				if errors.As(err, &forbidden) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(map[string]string{"error": err.Error()}) //nolint:errcheck
					return
				}
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			var body struct {
				Name   *string `json:"name"`
				Icon   *string `json:"icon"`
				Banner *string `json:"banner"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"}) //nolint:errcheck
				return
			}
			if _, err := database.ExecContext(r.Context(), `
				UPDATE servers SET
					name   = COALESCE(?, name),
					icon   = COALESCE(?, icon),
					banner = COALESCE(?, banner)
				WHERE id = 'main'
			`, body.Name, body.Icon, body.Banner); err != nil {
				http.Error(w, "failed to update settings", http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		// License status
		r.Get("/license/status", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]bool{"is_premium": lic.IsPremium()}) //nolint:errcheck
		})

		// Invites
		r.Get("/invites", invitesHandler.List)
		r.Post("/invites", invitesHandler.Create)
		r.Delete("/invites/{token}", invitesHandler.Revoke)
		r.Post("/invites/{token}/use", invitesHandler.Use)

		// Roles
		r.Get("/roles", rolesHandler.ListRoles)
		r.Post("/roles", rolesHandler.CreateRole)
		r.Patch("/roles/{id}", rolesHandler.UpdateRole)
		r.Delete("/roles/{id}", rolesHandler.DeleteRole)

		// Member role assignment
		r.Post("/members/{user_id}/roles/{role_id}", rolesHandler.AssignRole)
		r.Delete("/members/{user_id}/roles/{role_id}", rolesHandler.RemoveRole)

		// Members
		r.Get("/members", rolesHandler.ListMembers)
		r.Delete("/members/{user_id}", func(w http.ResponseWriter, r *http.Request) {
			callerID := mw.GetUserID(r.Context())
			if err := permissions.RequirePermission(database, callerID, permissions.MembersKick); err != nil {
				var forbidden permissions.ErrForbidden
				if errors.As(err, &forbidden) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(map[string]string{"error": err.Error()}) //nolint:errcheck
					return
				}
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			targetID := chi.URLParam(r, "user_id")
			database.ExecContext(r.Context(), `DELETE FROM members WHERE user_id = ?`, targetID) //nolint:errcheck
			w.WriteHeader(http.StatusNoContent)
		})

		// Categories
		r.Get("/categories", channelsHandler.ListCategories)
		r.Post("/categories", channelsHandler.CreateCategory)

		// Channels
		r.Post("/channels", channelsHandler.CreateChannel)
		r.Route("/channels/{id}", func(r chi.Router) {
			r.Patch("/", channelsHandler.UpdateChannel)
			r.Delete("/", channelsHandler.DeleteChannel)
			r.Get("/messages", channelsHandler.ListMessages)
			r.Post("/messages", channelsHandler.CreateMessage)
		})

		// Plugins
		r.Get("/plugins", pluginsHandler.List)
		r.Post("/plugins", pluginsHandler.Install)
		r.Patch("/plugins/{id}", pluginsHandler.SetEnabled)
		r.Delete("/plugins/{id}", pluginsHandler.Delete)
	})

	// SPA static file handler — serves the embedded React client.
	// Registered last so all API routes take priority.
	// Any path that doesn't resolve to a real file falls back to index.html
	// so React Router can handle client-side navigation.
	distFS, err := fs.Sub(clientDist, "client/dist")
	if err != nil {
		slog.Error("embed sub", "err", err)
		os.Exit(1)
	}
	fileServer := http.FileServer(http.FS(distFS))
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if _, err := distFS.Open(path); err != nil {
			// Unknown path — rewrite to root so the file server returns index.html.
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})

	slog.Info("server listening", "port", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
