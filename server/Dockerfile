# =============================================================================
# Stage 1 — build the React client
# Build context must be the repo root so both /client and /server are reachable.
# =============================================================================
FROM node:22-alpine AS client-builder

RUN npm install -g pnpm

WORKDIR /repo

# Copy workspace manifests first for layer-cache efficiency.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY client/package.json ./client/
COPY shared/package.json ./shared/
RUN pnpm install --frozen-lockfile

# Copy source and compile.
COPY client/ ./client/
COPY shared/ ./shared/
RUN pnpm --filter @spectrus/client build

# =============================================================================
# Stage 2 — build a fully static Go binary with the client embedded
# =============================================================================
FROM golang:1.22-alpine AS builder

# ca-certificates are baked into the binary's TLS roots via crypto/x509
RUN apk add --no-cache ca-certificates

WORKDIR /build

# Download dependencies first — this layer is cached unless go.mod/go.sum change
COPY server/go.mod server/go.sum ./
RUN go mod download

# Copy the Go source (server/ subtree maps to WORKDIR /build).
COPY server/ .

# Copy the compiled React client into the location the go:embed directive expects:
#   //go:embed all:client/dist  (relative to cmd/server/main.go)
COPY --from=client-builder /repo/client/dist ./cmd/server/client/dist

# CGO_ENABLED=0  → pure-Go binary; no C runtime required in the final image
# GOOS=linux     → cross-compile for Linux regardless of build host OS
# -ldflags -s -w → strip debug info + symbol table; typically halves binary size
RUN CGO_ENABLED=0 GOOS=linux \
    go build -ldflags="-s -w" -o /spectrus-server ./cmd/server

# =============================================================================
# Stage 3 — minimal runtime image
# =============================================================================
FROM alpine:3.21

# wget: used by the HEALTHCHECK instruction below
# tzdata: allows TZ env var to work correctly in structured log timestamps
# ca-certificates: needed for outbound TLS calls (Keygen.sh license, etc.)
RUN apk add --no-cache wget ca-certificates tzdata

# Run as a dedicated non-root user — principle of least privilege
RUN addgroup -S spectrus && adduser -S spectrus -G spectrus

WORKDIR /app
COPY --from=builder /spectrus-server /app/spectrus-server

# Ensure /data directory exists and is owned by our user.
# The docker-compose volume mount will overlay this at runtime.
RUN mkdir -p /data && chown spectrus:spectrus /data

USER spectrus

EXPOSE 3000

# Docker health probe — polls the unauthenticated /health endpoint.
# --start-period gives the server time to run DB migrations before checks begin.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/spectrus-server"]
