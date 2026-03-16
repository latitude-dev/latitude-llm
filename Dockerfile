# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Base image — shared by all stages
# ---------------------------------------------------------------------------
FROM node:25-slim AS base

# Install pnpm using npm (corepack was removed from Node.js 25)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    npm install -g pnpm@10.30.3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable pipefail for proper error handling in piped commands
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json           apps/api/package.json
COPY apps/web/package.json           apps/web/package.json
COPY apps/ingest/package.json        apps/ingest/package.json
COPY apps/workers/package.json       apps/workers/package.json
COPY apps/workflows/package.json     apps/workflows/package.json

# Copy all package.json files from packages/
COPY packages/ /tmp/packages-src/
RUN find /tmp/packages-src -name 'package.json' -not -path '*/node_modules/*' | while read src; do \
      dest="packages/${src#/tmp/packages-src/}"; \
      mkdir -p "$(dirname "$dest")"; \
      cp "$src" "$dest"; \
    done && rm -rf /tmp/packages-src

# Skip postinstall scripts (chdb and other dev-only native deps)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# Source — full repo with deps installed
# ---------------------------------------------------------------------------
FROM base AS source

COPY --from=deps /app/node_modules         ./node_modules
COPY --from=deps /app/apps/*/node_modules   ./
COPY --from=deps /app/packages/             ./packages/
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# Build — compile all packages
# ---------------------------------------------------------------------------
FROM source AS build

ARG VITE_LAT_API_URL
ARG VITE_LAT_WEB_URL

# Cache buster - force rebuild when package scripts change
ARG CACHE_BUSTER=1

RUN pnpm build

# ---------------------------------------------------------------------------
# Target: api — minimal image with only api app
# ---------------------------------------------------------------------------
FROM base AS api

# Copy entire app and remove unnecessary files
COPY --from=build /app ./

# Remove source files, tests, and other unnecessary files
# Note: packages are not needed since everything is bundled by tsup
RUN rm -rf apps/web apps/ingest apps/workers apps/workflows packages && \
    find . -name "*.ts" -not -path "*/node_modules/*" -not -name "*.d.ts" -delete && \
    find . -name "tsconfig.json" -not -path "*/node_modules/*" -delete && \
    find . -name "*.test.ts" -not -path "*/node_modules/*" -delete && \
    find . -name "*.spec.ts" -not -path "*/node_modules/*" -delete

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/server.cjs"]

# ---------------------------------------------------------------------------
# Target: ingest — minimal image with only ingest app
# ---------------------------------------------------------------------------
FROM base AS ingest

# Copy entire app and remove unnecessary files
COPY --from=build /app ./

# Remove source files, tests, and other unnecessary files
# Note: packages are not needed since everything is bundled by tsup
RUN rm -rf apps/api apps/web apps/workers apps/workflows packages && \
    find . -name "*.ts" -not -path "*/node_modules/*" -not -name "*.d.ts" -delete && \
    find . -name "tsconfig.json" -not -path "*/node_modules/*" -delete && \
    find . -name "*.test.ts" -not -path "*/node_modules/*" -delete && \
    find . -name "*.spec.ts" -not -path "*/node_modules/*" -delete

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "apps/ingest/dist/server.cjs"]

# ---------------------------------------------------------------------------
# Target: workers — minimal image with only workers app
# ---------------------------------------------------------------------------
FROM base AS workers

# Copy entire app and remove unnecessary files
COPY --from=build /app ./

# Remove source files, tests, and other unnecessary files
# Note: packages are not needed since everything is bundled by tsup
RUN rm -rf apps/api apps/web apps/ingest apps/workflows packages && \
    find . -name "*.ts" -not -path "*/node_modules/*" -not -name "*.d.ts" -delete && \
    find . -name "tsconfig.json" -not -path "*/node_modules/*" -delete && \
    find . -name "*.test.ts" -not -path "*/node_modules/*" -delete && \
    find . -name "*.spec.ts" -not -path "*/node_modules/*" -delete

ENV NODE_ENV=production
EXPOSE 9090

CMD ["node", "apps/workers/dist/server.cjs"]

# ---------------------------------------------------------------------------
# Target: web — minimal image with only web app (TanStack Start SSR)
# ---------------------------------------------------------------------------
FROM base AS web

# Copy built web app
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy packages (needed for workspace dependencies)
COPY --from=build /app/packages ./packages

# Reinstall production dependencies (preserves symlinks correctly)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --production

# Remove source files from packages (keep only dist)
RUN find packages -name "src" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find packages -name "*.ts" -not -path "*/node_modules/*" -not -name "*.d.ts" -delete && \
    find packages -name "tsconfig.json" -delete && \
    find . -name "*.test.ts" -delete && \
    find . -name "*.spec.ts" -delete

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/web/dist/server/server-entry.js"]

# ---------------------------------------------------------------------------
# Target: migrations — minimal image with migration tools
# ---------------------------------------------------------------------------
FROM base AS migrations

# Install curl and goose for ClickHouse migrations
# hadolint ignore=DL3008
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl=7.* && \
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

# Copy entire app and remove apps not needed for migrations
COPY --from=build /app ./

RUN rm -rf apps/web apps/api apps/ingest apps/workers apps/workflows && \
    find . -name "*.test.ts" -not -path "*/node_modules/*" -delete && \
    find . -name "*.spec.ts" -not -path "*/node_modules/*" -delete

ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm --filter @platform/db-postgres pg:migrate && pnpm --filter @platform/db-clickhouse ch:up && pnpm --filter @platform/db-weaviate wv:migrate"]
