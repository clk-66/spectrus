# =============================================================================
# Stage 1 — build a fully static Go binary
# =============================================================================
FROM golang:1.22-alpine AS builder

# ca-certificates are baked into the binary's TLS roots via crypto/x509
RUN apk add --no-cache ca-certificates

WORKDIR /build

# Download dependencies first — this layer is cached unless go.mod/go.sum change
COPY go.mod go.sum ./
RUN go mod download

# Copy source and compile
# CGO_ENABLED=0  → pure-Go binary; no C runtime required in the final image
# GOOS=linux     → cross-compile for Linux regardless of build host OS (safe on ARM Macs)
# -ldflags -s -w → strip debug info + symbol table; typically halves binary size
COPY . .
RUN CGO_ENABLED=0 GOOS=linux \
    go build -ldflags="-s -w" -o /spectrus-server ./cmd/server

# =============================================================================
# Stage 2 — minimal runtime image
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
# Failure = server process crashed or DB is unresponsive.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/spectrus-server"]
