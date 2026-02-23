# Spectrus — Claude Code Context

## Project
Modern self-hosted voice and text community platform. Discord UX quality, TeamSpeak stability ethos. Open core (MIT + Commons Clause), premium features behind Keygen.sh license.

## Repo structure
/server       Go backend (chi, gorilla/websocket, modernc sqlite)
/media        mediasoup Node.js WebRTC SFU microservice
/client       React 18 + TypeScript + Vite (no Tailwind — CSS modules + design tokens)
/desktop      Tauri v2 shell — wraps /client, OS keychain, deep links, auto-updater
/shared       Shared types
Go module: github.com/clk-66/spectrus

## Backend conventions
- Permission checks via permissions.RequirePermission(db, userID, permissions.XxxY) — never skip on mutating endpoints
- Errors: 400 bad input, 401 unauth, 402 premium required, 403 forbidden, 404 not found, 409 conflict, 410 gone, 422 invalid, 502 upstream
- PATCH handlers use map[string]json.RawMessage for partial updates — never zero out absent fields
- DB access injected via handler structs, never global
- SQLite WAL mode, MaxOpenConns(1) for write serialisation
- Hub broadcasts never go via h.broadcast channel from within Run() — fan out directly to avoid deadlock
- All WS goroutines touching c.send after disconnect use defer recover()

## Frontend conventions
- CSS modules + design tokens (tokens.css) — no Tailwind, no inline styles
- Zustand stores: useAuthStore, useUIStore, useServersStore, useChannelsStore, useMessagesStore, useVoiceStore, useMembersStore
- API calls via apiFetch in api/client.ts — handles JWT + 401 refresh transparently
- Token storage: KeychainService.ts — Tauri OS keychain (invoke keychain_get/set/delete) or localStorage fallback
- WebSocket: SpectrusSocket.ts per server, connects via ?token= query param, exponential backoff 1→2→4→8→30s
- Theme via data-theme="dark|light" on <html>, persisted in localStorage
- TypeScript strict mode — no any, no ts-ignore

## Design tokens (key values)
Accent: #7c6af7 (dark) / #6b59e8 (light)
Server rail: 56px | Channel sidebar: 220px | Member sidebar: 200px
Server icon: square↔circle morph on hover, 3px accent left-bar active indicator

## Key architectural decisions
- Per-server accounts only — no central identity provider
- SQLite + Litestream (no Postgres)
- mediasoup runs as internal sidecar — never exposed publicly
- Plugin system: GitHub-based manifest fetch, execution deferred post-MVP
- License: Keygen.sh, 7-day offline grace, IsPremium() + PremiumOnly() middleware
- WS ticket system (short-lived token for WS auth) is a post-MVP security hardening task

## What's built
✅ Go: auth, hub, permissions, channels, categories, invites, roles, members, voice signaling, plugins, license
✅ mediasoup microservice
✅ React: design system, layout shell (3-col), auth views (login/register), TextChannel, VoiceChannel, JoinServer, ServerSettings (7 tabs)
✅ Tauri v2 desktop shell: OS keychain, spectrus:// deep links, auto-updater, macOS overlay title bar
✅ Docker: multi-stage Dockerfiles (server + media), docker-compose with healthchecks, .env.example

## Known TODOs (intentional post-MVP)
- ServerRail.tsx: "add server" button opens no modal — multi-server UI is post-MVP
- WS ticket auth (CLAUDE.md note above) — currently passes JWT directly in query param

## Pre-release checklist
Before tagging v1.0.0:
1. Generate Tauri signing keypair: `pnpm --filter @spectrus/desktop tauri signer generate`
   - Paste pubkey into desktop/src-tauri/tauri.conf.json → plugins.updater.pubkey
   - Store private key in GitHub secret TAURI_SIGNING_PRIVATE_KEY
2. Add app icons: `pnpm --filter @spectrus/desktop tauri icon path/to/1024x1024.png`
   (generates all sizes into desktop/src-tauri/icons/)
3. Set SPECTRUS_JWT_SECRET to a real secret (openssl rand -hex 32)
4. Set MEDIASOUP_ANNOUNCED_IP to the server's public IP
5. Restrict WebSocket CheckOrigin in hub.go to SPECTRUS_DOMAIN
