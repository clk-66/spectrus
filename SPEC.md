# Project Spec — Spectrus (working title)
> A modern, self-hosted voice and text community platform for gaming communities and organizations.
> Fast, privacy-first, open core.

---

## Vision

A spiritual successor to TeamSpeak with Discord's UX quality. Self-hostable, decentralized, open source core with a premium license tier for organizations that want advanced features. No central dependency for day-to-day operation — each server instance is fully autonomous.

---

## Guiding Principles

- **Fast by default** — the client must feel instant. No loading spinners for switching servers or channels.
- **Privacy-first** — no phone-home except optional license validation. No telemetry without explicit opt-in.
- **Sysadmin-friendly** — zero-dependency deployment, sensible defaults, no surprises.
- **Open and trustworthy** — core is open source so communities can audit what handles their voice comms.
- **Lean operationally** — the product owner (you) runs no infrastructure beyond license validation (Keygen.sh).

---

## Licensing Model

| Tier | License | Features |
|---|---|---|
| Community | MIT + Commons Clause | All core features |
| Premium | Annual per-instance via Keygen.sh | Premium features unlocked via feature flags |

**Commons Clause** prevents third parties from selling the software as a competing hosted service without a commercial agreement.

**Premium feature enforcement:** Go backend checks Keygen.sh license key on startup and periodically. Feature flags are toggled server-side. Circumvention requires forking — a social contract violation, not a technical one.

**Premium features (nice-to-haves, not paywalled necessities):**
- Custom branding beyond basic themes
- Advanced permission system (per-channel role overrides, temporary roles, time-limited access)
- TURN relay support for servers behind strict NAT
- Advanced audit logs with export
- SSO integration hooks (OIDC/SAML)
- Higher resource limits (max concurrent users, file upload size, message retention policies)
- Priority support SLA

---

## Repository Structure

Monorepo managed with pnpm workspaces (JS/TS) and Go modules.

```
/server          # Go backend — REST API + WebSocket hub + business logic
/media           # mediasoup Node.js microservice — WebRTC SFU
/client          # React + TypeScript — shared UI for web and desktop
/desktop         # Tauri shell — wraps /client for native desktop app
/shared          # Shared type definitions, protocol schemas, constants
/docs            # Developer and operator documentation
/scripts         # Build, release, Docker scripts
SPEC.md          # This file
docker-compose.yml
Dockerfile
```

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Backend | Go | Single static binary, excellent concurrency, clean Docker packaging |
| Voice microservice | mediasoup (Node.js) | WebRTC SFU, battle-tested, browser-native voice |
| Frontend | React + TypeScript | Ecosystem maturity, component reuse across web/desktop |
| Desktop shell | Tauri | Lightweight native wrapper, OS keychain access, built-in updater |
| Database | SQLite (WAL mode) + Litestream | Zero config, single file, continuous replication to S3-compatible storage |
| Real-time | WebSocket (gorilla/websocket) | Event-driven presence, messaging, voice signaling |
| REST API | Go (chi router) | Auth, settings, history, plugin management, invite links |
| License validation | Keygen.sh | Hosted license API, offline grace period, machine fingerprinting |
| Containerization | Docker + GitHub Container Registry (ghcr.io) | Standard, sysadmin-friendly deployment |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT (Tauri / Browser)           │
│  React UI — maintains N WebSocket connections,       │
│  one per joined server. Credentials stored in        │
│  OS keychain per server. Instant server switching.   │
└──────────────┬──────────────────────────────────────┘
               │  WSS + HTTPS (per server endpoint)
               ▼
┌─────────────────────────────────────────────────────┐
│              GO BACKEND (per server instance)        │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  REST API   │  │  WS Hub      │  │  License   │  │
│  │  (chi)      │  │  (gorilla)   │  │  Check     │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────┘  │
│         │                │                           │
│  ┌──────▼────────────────▼───────────────────────┐  │
│  │              Business Logic Layer              │  │
│  │  Auth · Channels · Permissions · Plugins ·    │  │
│  │  Presence · Messages · Invites · Settings     │  │
│  └──────────────────────┬────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────▼────────────────────────┐  │
│  │         SQLite (WAL) + Litestream              │  │
│  └───────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────┘
               │  Internal HTTP API
               ▼
┌─────────────────────────────────────────────────────┐
│         MEDIASOUP MICROSERVICE (Node.js)             │
│  WebRTC SFU — handles voice/video routing            │
│  Runs as sidecar container                           │
└─────────────────────────────────────────────────────┘
```

Each server instance is a self-contained Docker Compose stack:
- `server` container (Go backend)
- `media` container (mediasoup)
- `litestream` sidecar (optional, for backup)

---

## Identity & Authentication

- **Per-server accounts only.** No central identity provider.
- Each server maintains its own user table in SQLite.
- Auth via username + password, bcrypt hashed.
- Sessions via signed JWT (short-lived access token + refresh token).
- Client stores tokens per server in the **OS keychain** (Tauri stronghold / browser secure storage).
- Auto-login on app start — user never sees repeated login prompts after initial setup.
- Server owners can optionally enable OIDC/SAML SSO as a **premium feature**.

---

## Client Architecture

### Multi-server connection model
- On launch, client reads all saved server connections from keychain.
- Establishes WebSocket connections to all servers simultaneously.
- Each connection runs in its own worker/context with independent auth.
- Sidebar shows all connected servers — click to switch instantly (no reconnect).
- Voice is only active in the currently focused server.

### Invite link flow
- Format: `spectrus://join/<host>/<invite-token>` or `https://<host>/invite/<token>`
- Client intercepts the protocol link or the user pastes it manually.
- Client fetches server metadata (name, member count, icon) from the invite endpoint.
- User confirms, creates account or logs in, joins server.
- Server is added to the client's saved connections.

### Credential storage
- Tauri: `tauri-plugin-stronghold` backed by OS keychain.
- Web: `localStorage` encrypted with a session-derived key (best effort for web — full security requires desktop).

---

## Real-time Protocol

### WebSocket events (server → client)
```
MESSAGE_CREATE       { channel_id, message }
MESSAGE_UPDATE       { channel_id, message_id, content }
MESSAGE_DELETE       { channel_id, message_id }
CHANNEL_CREATE       { channel }
CHANNEL_UPDATE       { channel }
CHANNEL_DELETE       { channel_id }
PRESENCE_UPDATE      { user_id, status }
VOICE_STATE_UPDATE   { user_id, channel_id | null }
VOICE_SIGNAL         { type, sdp | candidate, from_user_id }
ROLE_UPDATE          { role }
MEMBER_UPDATE        { member }
PLUGIN_EVENT         { plugin_id, payload }
```

### REST API (selected endpoints)
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
GET    /servers/@me
GET    /channels/:id/messages
POST   /channels/:id/messages
GET    /invites/:token
POST   /invites
GET    /plugins
POST   /plugins          (install from GitHub URL)
DELETE /plugins/:id
GET    /admin/settings
PATCH  /admin/settings
```

---

## Voice Architecture

- **Protocol:** WebRTC via mediasoup SFU
- **Codec:** Opus (48kHz, stereo, variable bitrate)
- **Flow:**
  1. Client joins a voice channel — backend notifies mediasoup via internal HTTP
  2. mediasoup returns WebRTC offer
  3. Client completes ICE negotiation
  4. Audio routed through SFU — server never decodes audio, just forwards RTP packets
- **TURN relay:** Optional premium feature. Server owners can configure their own TURN server credentials. No TURN infrastructure from the product owner.
- **Voice activity detection:** Client-side VAD before transmission (reduces bandwidth, improves UX)

---

## Plugin System

### Philosophy
No central marketplace. Plugins are community-maintained GitHub repositories. The product owner defines the manifest spec and API surface only.

### Installation flow
1. Server admin pastes a GitHub repo URL into the admin panel.
2. Server fetches `spectrus-plugin.json` manifest from the repo root.
3. Manifest is validated against the spec.
4. Server downloads the plugin bundle and stores it locally.
5. Plugin is activated — backend loads it, client fetches plugin UI assets from the server.

### Plugin manifest spec (`spectrus-plugin.json`)
```json
{
  "id": "com.example.myplugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "someone",
  "spectrus_min_version": "1.0.0",
  "permissions": ["messages:read", "messages:write", "members:read"],
  "backend_entry": "dist/index.js",
  "client_entry": "dist/client.js"
}
```

### Plugin API surface (Go backend exposes to plugins)
- Read/write messages in channels (with permission)
- Listen to WebSocket events
- Register slash commands
- Store plugin-scoped data in SQLite
- Emit custom WebSocket events to clients

---

## MVP Feature Set

### Core (Community tier)
- [x] Voice channels (WebRTC, multi-user)
- [x] Text channels (persistent, paginated history)
- [x] Roles & permissions (server-wide)
- [x] Channel categories
- [x] Invite links (with expiry and use limits)
- [x] Welcome screen (configurable by server admin)
- [x] Basic theming (color scheme, server icon, banner)
- [x] Custom emoji (server-scoped)
- [x] Plugin system (GitHub-based install)
- [x] Web client
- [x] Desktop client (Tauri, Windows/macOS/Linux)

### Premium tier additions
- [ ] Advanced permissions (per-channel overrides, temporary roles)
- [ ] Custom branding (full CSS override, custom domain)
- [ ] Advanced audit log with export
- [ ] SSO hooks (OIDC/SAML)
- [ ] Higher resource limits
- [ ] TURN relay configuration UI

### Post-MVP (not in initial scope)
- [ ] Mobile client (Tauri mobile when ready)
- [ ] Screen sharing
- [ ] Video channels
- [ ] Global friends list / cross-server DMs

---

## Deployment

### Docker Compose (recommended)
```yaml
version: '3.8'
services:
  server:
    image: ghcr.io/clk-66/spectrus-server:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - SPECTRUS_LICENSE_KEY=${SPECTRUS_LICENSE_KEY}
      - SPECTRUS_DOMAIN=community.example.com
      - SPECTRUS_DB_PATH=/data/spectrus.db

  media:
    image: ghcr.io/clk-66/spectrus-media:latest
    network_mode: host   # Required for WebRTC ICE
    environment:
      - MEDIASOUP_LISTEN_IP=0.0.0.0
      - MEDIASOUP_ANNOUNCED_IP=${SERVER_PUBLIC_IP}

  litestream:
    image: litestream/litestream
    volumes:
      - ./data:/data
      - ./litestream.yml:/etc/litestream.yml
```

### VM Image
- Built from the same Dockerfile using Packer
- Ships as OVA (VMware/VirtualBox) and raw image (Proxmox/KVM)
- First-boot setup wizard via CLI

### Update mechanism
- **Server:** Server owners pull new Docker image tags manually. No auto-update.
- **Desktop client:** Tauri built-in updater checks GitHub Releases endpoint on launch. User prompted, never forced.
- **Web client:** Updates automatically when server owner updates their Docker image.

---

## Development Setup

### Prerequisites
- Go 1.22+
- Node.js 20+
- pnpm 9+
- Rust + Tauri CLI (for desktop builds)
- Docker + Docker Compose

### Getting started
```bash
git clone https://github.com/clk-66/spectrus
cd spectrus
pnpm install
cp .env.example .env

# Start all services in dev mode
docker compose -f docker-compose.dev.yml up    # mediasoup
cd server && go run ./cmd/server               # Go backend
cd client && pnpm dev                          # React client
cd desktop && pnpm tauri dev                   # Tauri desktop
```

---

## Open Questions / Future Decisions

- Exact Keygen.sh plan tier and license schema design
- Plugin sandboxing strategy (Deno runtime vs Node.js vm module vs WASM)
- Push notification strategy for background mentions (per-server direct push vs polling)
- Litestream backup target (S3, Backblaze B2, or local only by default)
- Community governance for the plugin ecosystem (topic tag convention on GitHub)

---

*Last updated: February 2026*
*Status: Pre-development — alignment complete, ready to scaffold*
