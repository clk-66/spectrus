# =============================================================================
# Stage 1 — install deps and compile mediasoup native worker + TypeScript
# =============================================================================
FROM node:22-alpine AS builder

# mediasoup compiles a native C++ worker binary during npm install.
# python3/make/cmake/g++ are the minimal toolchain; linux-headers provides
# kernel API headers needed by libuv (a mediasoup dependency).
RUN apk add --no-cache python3 py3-pip make cmake g++ linux-headers

WORKDIR /app

# Install dependencies first — this layer is cached unless package*.json change.
# npm ci (not npm install) ensures the lockfile is respected exactly.
COPY package*.json ./
RUN npm ci

# Compile TypeScript
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# =============================================================================
# Stage 2 — minimal runtime image
# =============================================================================
FROM node:22-alpine

# wget: used by the HEALTHCHECK instruction below
RUN apk add --no-cache wget

# Run as a dedicated non-root user — principle of least privilege
RUN addgroup -S spectrus && adduser -S spectrus -G spectrus

WORKDIR /app

# Copy compiled JS and node_modules (which includes the pre-built mediasoup-worker
# binary for musl/Alpine — it was compiled in Stage 1 against the same libc).
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

USER spectrus

EXPOSE 3001

# Larger start-period: mediasoup worker process takes a moment to initialise.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
