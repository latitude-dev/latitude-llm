ARG PROJECT="@latitude-data/workers"
ARG PROJECT_PATH="apps/workers"
ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA

FROM node:22-alpine AS alpine

# Install build dependencies
RUN apk add --no-cache libc6-compat curl python3 make g++ gcc

FROM alpine AS base

# Will be used to cache pnpm store
RUN npm install -g corepack@0.31.0 && corepack enable

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN pnpm i -g turbo

FROM base AS pruner

ARG PROJECT

WORKDIR /app

COPY . .

RUN turbo prune "${PROJECT}" --docker

# BUILDER stage
# ------------------------------------------------------
FROM base AS builder

ARG PROJECT
ARG PROJECT_PATH
ARG DD_GIT_COMMIT_SHA
ARG DD_SITE

ENV RELEASE_VERSION=${DD_GIT_COMMIT_SHA:-unknown}
ENV DD_SITE=${DD_SITE:-}

WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --shamefully-hoist \
  --frozen-lockfile \
  --ignore-scripts \
  --filter "${PROJECT}..."

COPY --from=pruner /app/out/full/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  BUILDING_CONTAINER=true \
  pnpm turbo build --filter="${PROJECT}..."

# Upload source maps to Datadog
RUN --mount=type=secret,id=DATADOG_API_KEY \
  if [ -s /run/secrets/DATADOG_API_KEY ]; then \
    echo "Uploading workers source maps to Datadog..."; \
    export DATADOG_API_KEY="$(cat /run/secrets/DATADOG_API_KEY)" && \
    cd apps/workers && \
    pnpm datadog:sourcemaps; \
  else \
    echo "Skipping Datadog source map upload for workers - DATADOG_API_KEY secret not provided"; \
  fi

# Since `pnpm prune` doesn't handle recursive dependencies effectively,
# we follow pnpm's recommended approach: remove node_modules entirely
# and perform a fresh production install with --frozen-lockfile
RUN rm -fr node_modules
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --prod \
  --frozen-lockfile \
  --ignore-scripts \
  --shamefully-hoist \
  --filter "${PROJECT}..."

# RUNNER stage
# ------------------------------------------------------
FROM node:22-alpine AS runner

# Required for the health check
RUN apk add --update --no-cache curl

# Install uv and Python (standalone build - self-contained, no system deps)
# Copy .python-version first so we install the exact version needed
COPY apps/engine/.python-version /tmp/.python-version
COPY --from=ghcr.io/astral-sh/uv:0.9.30 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR="/opt/python"
RUN uv python install $(cat /tmp/.python-version) && chown -R 1001:1001 /opt/python

ARG PROJECT_PATH
ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA
ARG PORT=8080

ENV PORT=$PORT
ENV NODE_ENV=production
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL:-}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA:-}
ENV RELEASE_VERSION=${DD_GIT_COMMIT_SHA:-}

EXPOSE $PORT

# Install AWS CLI using Alpine package manager
RUN apk add --no-cache \
  aws-cli \
  groff \
  less

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 latitude
# Set permissions for local storage
# User ID and Group ID 1001 is used to match the user 'latitude' and group 'nodejs' in the runner image.
RUN set -e; \
  mkdir -p /app/storage/files; \
  mkdir -p /app/apps/web/public/files; \
  chown -R 1001:1001 /app/storage/files /app/apps/web/public/files
USER latitude

WORKDIR /app

COPY --from=builder --chown=latitude:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=latitude:nodejs /app/${PROJECT_PATH} ./${PROJECT_PATH}
COPY --from=builder --chown=latitude:nodejs /app/packages/telemetry/typescript ./packages/telemetry/typescript
COPY --from=builder --chown=latitude:nodejs /app/packages/core/src/assets/eu-central-1-bundle.pem ./packages/core/src/assets/eu-central-1-bundle.pem

# Copy Python engine source and install dependencies
COPY --chown=latitude:nodejs apps/engine/app ./apps/engine/app
COPY --chown=latitude:nodejs apps/engine/pyproject.toml ./apps/engine/pyproject.toml
COPY --chown=latitude:nodejs apps/engine/uv.lock ./apps/engine/uv.lock
COPY --chown=latitude:nodejs apps/engine/.python-version ./apps/engine/.python-version
RUN --mount=type=cache,target=/home/latitude/.cache/uv,uid=1001,gid=1001 \
  cd /app/apps/engine && uv sync --frozen --no-dev --no-install-project

WORKDIR /app/${PROJECT_PATH}

CMD ["node", "dist/server.js"]
