# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Base image — shared by all stages
# ---------------------------------------------------------------------------
FROM node:25-slim AS base

# Install pnpm using npm (corepack was removed from Node.js 25)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates=202* curl && \
  npm install -g pnpm@10.30.3 && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable pipefail for proper error handling in piped commands
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# ---------------------------------------------------------------------------
# Prefetch dependencies into pnpm store (cache-friendly)
# ---------------------------------------------------------------------------
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Populate pnpm store from lockfile only for better cache reuse
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm fetch --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# Source — full repo with deps installed
# ---------------------------------------------------------------------------
FROM deps AS source

COPY . .

# Skip postinstall scripts (chdb and other dev-only native deps)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts --offline

# ---------------------------------------------------------------------------
# Build api — compile api app (turbo builds dependencies automatically)
# ---------------------------------------------------------------------------
FROM source AS build-api

RUN pnpm --filter @app/api build

# ---------------------------------------------------------------------------
# Build ingest — compile ingest app (turbo builds dependencies automatically)
# ---------------------------------------------------------------------------
FROM source AS build-ingest

RUN pnpm --filter @app/ingest build

# ---------------------------------------------------------------------------
# Build workers — compile workers app (turbo builds dependencies automatically)
# ---------------------------------------------------------------------------
FROM source AS build-workers

RUN pnpm --filter @app/workers build

# ---------------------------------------------------------------------------
# Build workflows — Temporal worker app
# ---------------------------------------------------------------------------
FROM source AS build-workflows

RUN pnpm --filter @app/workflows build

# ---------------------------------------------------------------------------
# Build web — compile web app (turbo builds dependencies automatically)
# ---------------------------------------------------------------------------
FROM source AS build-web

ARG VITE_LAT_API_URL
ARG VITE_LAT_WEB_URL
ARG VITE_LAT_TURNSTILE_SITE_KEY

RUN pnpm --filter @app/web build

# ---------------------------------------------------------------------------
# Build migrations — compile packages needed for migrations
# ---------------------------------------------------------------------------
FROM source AS build-migrations

RUN pnpm --filter @platform/db-postgres build && \
  pnpm --filter @platform/db-clickhouse build && \
  pnpm --filter @platform/db-weaviate build

# ---------------------------------------------------------------------------
# Runtime base — shared runtime settings and cleanup helper
# ---------------------------------------------------------------------------
FROM base AS runtime

ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA

ENV NODE_ENV=production
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

COPY packages/platform/db-postgres/global-bundle.pem /app/global-bundle.pem

RUN groupadd -r latitude && useradd -r -g latitude -d /app -s /sbin/nologin latitude && \
  chown -R latitude:latitude /app

RUN cat <<'EOF' > /usr/local/bin/prune-workspace && chmod +x /usr/local/bin/prune-workspace
#!/bin/bash
set -euo pipefail

find packages -name "src" -type d -exec rm -rf {} + 2>/dev/null || true
find packages -name "*.ts" -not -path "*/node_modules/*" -not -name "*.d.ts" -delete
find packages -name "tsconfig.json" -delete
find . -name "*.test.ts" -delete
find . -name "*.spec.ts" -delete
EOF

RUN cat <<'EOF' > /usr/local/bin/install-prod-deps && chmod +x /usr/local/bin/install-prod-deps
#!/bin/bash
set -euo pipefail

pnpm install --frozen-lockfile --ignore-scripts --production
EOF

# ---------------------------------------------------------------------------
# Target: api — minimal image with only api app
# ---------------------------------------------------------------------------
FROM runtime AS api

COPY --from=build-api /app/apps/api/dist ./apps/api/dist
COPY --from=build-api /app/apps/api/package.json ./apps/api/package.json
COPY --from=build-api /app/package.json ./package.json
COPY --from=build-api /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build-api /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build-api /app/packages ./packages

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  install-prod-deps

RUN prune-workspace
USER latitude
EXPOSE 8080

CMD ["node", "--enable-source-maps", "apps/api/dist/server.cjs"]

# ---------------------------------------------------------------------------
# Target: ingest — minimal image with only ingest app
# ---------------------------------------------------------------------------
FROM runtime AS ingest

COPY --from=build-ingest /app/apps/ingest/dist ./apps/ingest/dist
COPY --from=build-ingest /app/apps/ingest/package.json ./apps/ingest/package.json
COPY --from=build-ingest /app/package.json ./package.json
COPY --from=build-ingest /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build-ingest /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build-ingest /app/packages ./packages

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  install-prod-deps

RUN prune-workspace
USER latitude
EXPOSE 8080

CMD ["node", "--enable-source-maps", "apps/ingest/dist/server.cjs"]

# ---------------------------------------------------------------------------
# Target: workers — minimal image with only workers app
# ---------------------------------------------------------------------------
FROM runtime AS workers

COPY --from=build-workers /app/apps/workers/dist ./apps/workers/dist
COPY --from=build-workers /app/apps/workers/package.json ./apps/workers/package.json
COPY --from=build-workers /app/package.json ./package.json
COPY --from=build-workers /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build-workers /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build-workers /app/packages ./packages

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  install-prod-deps

RUN prune-workspace
USER latitude
EXPOSE 8080

CMD ["node", "--enable-source-maps", "apps/workers/dist/server.cjs"]

# ---------------------------------------------------------------------------
# Target: workflows — Temporal worker (Temporal Cloud in AWS)
# ---------------------------------------------------------------------------
FROM runtime AS workflows

# Standalone Python for the GEPA optimizer subprocess (self-contained, no system deps)
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
COPY packages/platform/op-gepa/python/.python-version /tmp/.python-version
ENV UV_PYTHON_INSTALL_DIR="/opt/python"
RUN uv python install $(cat /tmp/.python-version) && chown -R latitude:latitude /opt/python

COPY --from=build-workflows /app/apps/workflows/dist ./apps/workflows/dist
COPY --from=build-workflows /app/apps/workflows/package.json ./apps/workflows/package.json
COPY --from=build-workflows /app/apps/workflows/src/workflows ./apps/workflows/src/workflows
COPY --from=build-workflows /app/apps/workflows/src/activities ./apps/workflows/src/activities
COPY --from=build-workflows /app/package.json ./package.json
COPY --from=build-workflows /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build-workflows /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build-workflows /app/packages ./packages

# Install GEPA Python dependencies into a venv via uv
RUN cd packages/platform/op-gepa/python && uv sync --frozen --no-dev --no-install-project

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  install-prod-deps

RUN prune-workspace

# Temporal bundles workflow source at runtime and resolves these workspace package
# subpath exports from the final image. Re-copy the small set of exported source
# files that workflows import after pruning removes package src/ directories.
COPY --from=build-workflows /app/packages/domain/evaluations/src/constants.ts ./packages/domain/evaluations/src/constants.ts
COPY --from=build-workflows /app/packages/domain/queue/src/workflow-registry.ts ./packages/domain/queue/src/workflow-registry.ts

USER latitude
EXPOSE 8080

ENV LAT_TEMPORAL_WORKFLOWS_PATH=/app/apps/workflows/src/workflows
ENV LAT_GEPA_PYTHON_ROOT=/app/packages/platform/op-gepa/python

CMD ["node", "--enable-source-maps", "apps/workflows/dist/server.cjs"]

# ---------------------------------------------------------------------------
# Target: web — minimal image with only web app (TanStack Start SSR with Nitro)
# ---------------------------------------------------------------------------
FROM runtime AS web

COPY --from=build-web /app/apps/web/.output ./apps/web/.output
COPY --from=build-web /app/apps/web/package.json ./apps/web/package.json
COPY --from=build-web /app/package.json ./package.json
COPY --from=build-web /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build-web /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build-web /app/packages ./packages

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  install-prod-deps

RUN prune-workspace
USER latitude
EXPOSE 8080

# --no-experimental-webstorage: Node.js 22+ exposes a global `localStorage` (Web Storage API).
# The `debug` package (bundled in the SSR output) tries to access it and triggers:
#   "Warning: `--localstorage-file` was provided without a valid path"
# Disabling it is correct for a server environment — localStorage is a browser-only API.
CMD ["node", "--enable-source-maps", "--no-experimental-webstorage", "apps/web/.output/server/index.mjs"]

# ---------------------------------------------------------------------------
# Target: migrations — minimal image with migration tools
# ---------------------------------------------------------------------------
FROM runtime AS migrations

# Install curl and goose for ClickHouse migrations
RUN apt-get update && \
  apt-get install -y --no-install-recommends curl && \
  GOOSE_VERSION=3.24.1 && \
  ARCH=$(dpkg --print-architecture) && \
  case "$ARCH" in \
  amd64) GOOSE_ARCH="x86_64" ;; \
  arm64) GOOSE_ARCH="aarch64" ;; \
  *) GOOSE_ARCH="$ARCH" ;; \
  esac && \
  curl -fsSL "https://github.com/pressly/goose/releases/download/v${GOOSE_VERSION}/goose_linux_${GOOSE_ARCH}" \
  -o /usr/local/bin/goose && \
  chmod +x /usr/local/bin/goose && \
  apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY --from=build-migrations /app/packages ./packages
COPY --from=build-migrations /app/apps/workflows ./apps/workflows
COPY --from=build-migrations /app/package.json ./package.json
COPY --from=build-migrations /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build-migrations /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts

USER latitude

CMD ["sh", "-c", "pnpm --filter @platform/db-postgres pg:migrate && pnpm --filter @platform/db-clickhouse ch:up && pnpm --filter @platform/db-weaviate wv:migrate"]
