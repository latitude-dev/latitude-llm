# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Base image — shared by all stages
# ---------------------------------------------------------------------------
FROM node:25-slim AS base

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

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

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Source — full repo with deps installed
# ---------------------------------------------------------------------------
FROM base AS source

COPY --from=deps /app/node_modules         ./node_modules
COPY --from=deps /app/apps/*/node_modules   ./
COPY --from=deps /app/packages/             ./packages/
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Build — compile all packages
# ---------------------------------------------------------------------------
FROM source AS build

ARG VITE_LAT_API_URL
ARG VITE_LAT_WEB_URL

RUN pnpm build

# ---------------------------------------------------------------------------
# Target: api
# ---------------------------------------------------------------------------
FROM base AS api

COPY --from=build /app ./

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/server.js"]

# ---------------------------------------------------------------------------
# Target: ingest
# ---------------------------------------------------------------------------
FROM base AS ingest

COPY --from=build /app ./

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "apps/ingest/dist/server.js"]

# ---------------------------------------------------------------------------
# Target: workers
# ---------------------------------------------------------------------------
FROM base AS workers

COPY --from=build /app ./

ENV NODE_ENV=production
EXPOSE 9090

CMD ["node", "apps/workers/dist/server.js"]

# ---------------------------------------------------------------------------
# Target: web (TanStack Start / Vite SSR)
# ---------------------------------------------------------------------------
FROM base AS web

COPY --from=build /app ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/web/.output/server/index.mjs"]

# ---------------------------------------------------------------------------
# Target: migrations
# Runs Postgres (drizzle-kit), ClickHouse (goose), and Weaviate migrations.
# ---------------------------------------------------------------------------
FROM base AS migrations

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    GOOSE_VERSION=3.24.3 && \
    ARCH=$(dpkg --print-architecture) && \
    curl -fsSL "https://github.com/pressly/goose/releases/download/v${GOOSE_VERSION}/goose_linux_${ARCH}" \
      -o /usr/local/bin/goose && \
    chmod +x /usr/local/bin/goose && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY --from=build /app ./

ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm --filter @platform/db-postgres pg:migrate && pnpm --filter @platform/db-clickhouse ch:up && pnpm --filter @platform/db-weaviate wv:migrate"]
