# Spectrus

A modern, self-hosted voice and text community platform. Discord-quality UX, TeamSpeak-inspired stability. Run it on your own hardware — your server, your data.

## What it is

Spectrus is an open-core platform you deploy yourself. It ships as a single Docker Compose stack:

- **Go REST + WebSocket server** — auth, channels, roles, invites, plugins, voice signaling
- **mediasoup SFU** — WebRTC voice rooms; runs as an internal sidecar, never exposed publicly
- **React client** — full desktop app via Tauri; also works in any modern browser
- **SQLite + Litestream** — zero-dependency database with optional continuous cloud backup

Premium features (custom branding, extended plugins) are unlocked via a Keygen.sh license key. The core is MIT-licensed.

---

## Quick start with Docker Compose

### 1. Prerequisites

- Docker + Docker Compose v2
- A Linux host with a public IP (required for WebRTC voice; `network_mode: host` is used by the media container)
- UDP ports **10000–10999** open in your firewall

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` — the two required values:

```env
SPECTRUS_JWT_SECRET=<output of: openssl rand -hex 32>
MEDIASOUP_ANNOUNCED_IP=<your server's public IP>
```

### 3. Start

```bash
docker compose up -d
```

The server is now running at **http://localhost:3000**.
Open it in a browser, create your first account, and you're in.

### 4. Optional: continuous backup

Spectrus uses Litestream for SQLite replication to S3-compatible storage. Copy `litestream.yml.example` (if provided) or create `litestream.yml`, then:

```bash
docker compose --profile backup up -d
```

---

## Desktop client

Pre-built installers for macOS, Windows, and Linux are available on the [Releases](https://github.com/clk-66/spectrus/releases) page.

| Platform | Format |
|----------|--------|
| macOS    | `.dmg` (universal — Apple Silicon + Intel) |
| Windows  | `.msi` or `.exe` (NSIS) |
| Linux    | `.AppImage` or `.deb` |

The desktop client stores auth tokens in the OS keychain (macOS Keychain / Windows Credential Manager / Linux libsecret) and supports `spectrus://join/<host>/<token>` deep links for one-click invite joining.

---

## Building from source

### Prerequisites

- Go 1.22+
- Node.js 22+ and pnpm 9+
- Rust stable (for the Tauri desktop shell)

### Server

```bash
cd server
go build ./cmd/server
```

### Client (browser)

```bash
pnpm install
pnpm --filter @spectrus/client build
# Output: client/dist/
```

### Media service

```bash
pnpm --filter @spectrus/media build
pnpm --filter @spectrus/media start
```

### Desktop app (Tauri)

```bash
# Development (starts Vite + Tauri concurrently)
pnpm --filter @spectrus/desktop dev

# Production build
pnpm --filter @spectrus/desktop build
```

---

## Environment variables

All variables are documented in [`.env.example`](.env.example). The only two you must set are:

| Variable | Description |
|----------|-------------|
| `SPECTRUS_JWT_SECRET` | Secret for signing JWTs — **generate with `openssl rand -hex 32`** |
| `MEDIASOUP_ANNOUNCED_IP` | Server's public IP, announced in WebRTC ICE candidates |

---

## Architecture overview

```
Browser / Tauri app
    │
    ├── HTTP/REST  ──► Go server (:3000)
    │                    │
    ├── WebSocket  ──► Go hub       ──► mediasoup (:3001, internal)
    │
    └── (Tauri only) OS keychain, spectrus:// deep links, auto-updater
```

- **Auth**: per-server accounts only; no central identity provider. JWT access tokens (15 min) + rotating refresh tokens (7 days), stored as SHA-256 hashes.
- **Channels**: text (paginated messages) and voice (WebRTC via mediasoup). Organised into categories.
- **Roles & permissions**: fine-grained permission strings, drag-to-reorder, per-member assignment.
- **Plugins**: GitHub-manifest-based install; execution sandboxing is post-MVP.
- **License**: [Keygen.sh](https://keygen.sh); 7-day offline grace period; `IsPremium()` guards premium endpoints.

---

## Contributing

Contributions are welcome. A few ground rules:

1. **Open an issue first** for anything beyond a trivial bug fix, so we can align on approach before you spend time on a PR.
2. **Backend**: follow the conventions in [`CLAUDE.md`](CLAUDE.md) — permission checks on every mutating endpoint, no global DB access, PATCH via `map[string]json.RawMessage`.
3. **Frontend**: CSS modules + design tokens only; no Tailwind; TypeScript strict mode (no `any`, no `ts-ignore`).
4. **Tests**: unit tests for anything non-trivial in Go packages. Frontend component tests appreciated but not yet required.
5. Run `go build ./...` and `tsc --noEmit` before opening a PR — CI will catch failures, but it's faster to catch them locally.

### Development workflow

```bash
# Terminal 1 — Go server (live-reload with air, or just restart manually)
cd server && go run ./cmd/server

# Terminal 2 — mediasoup
pnpm --filter @spectrus/media dev

# Terminal 3 — React client
pnpm --filter @spectrus/client dev
# → http://localhost:5173 (proxies API + WS to :3000)

# Terminal 4 — Desktop (optional)
pnpm --filter @spectrus/desktop dev
```

---

## License

The core platform is licensed under the **MIT License with Commons Clause** — free for personal and commercial self-hosting, not for resale as a hosted service. See [`LICENSE`](LICENSE) for the full text.

Premium features require a Keygen.sh license key purchased at [spectrus.app](https://spectrus.app) *(placeholder — not yet live)*.
