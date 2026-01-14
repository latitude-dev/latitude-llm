ARG PROJECT="@latitude-data/gateway"
ARG PROJECT_PATH="apps/gateway"
ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA

FROM node:22-alpine AS alpine

# Install build dependencies
RUN apk add --update --no-cache \
  libc6-compat \
  curl \
  sudo \
  build-base \
  g++ \
  bash \
  wget \
  cmake \
  musl-dev \
  clang \
  llvm \
  python3

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
  --frozen-lockfile \
  --shamefully-hoist \
  --ignore-scripts \
  --filter "${PROJECT}..."

COPY --from=pruner /app/out/full/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  BUILDING_CONTAINER=true \
  pnpm turbo build --filter="${PROJECT}..."

# Upload source maps to Datadog
RUN --mount=type=secret,id=DATADOG_API_KEY \
  if [ -s /run/secrets/DATADOG_API_KEY ]; then \
    echo "Uploading gateway source maps to Datadog..."; \
    export DATADOG_API_KEY="$(cat /run/secrets/DATADOG_API_KEY)" && \
    cd apps/gateway && \
    pnpm datadog:sourcemaps; \
  else \
    echo "Skipping Datadog source map upload for gateway - DATADOG_API_KEY secret not provided"; \
  fi

# Since `pnpm prune` doesn't handle recursive dependencies effectively,
# we follow pnpm's recommended approach: remove node_modules entirely
# and perform a fresh production install with --frozen-lockfile
RUN rm -fr node_modules
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --prod \
  --frozen-lockfile \
  # This flag produces a single flat node_moduels directory ensuring the app
  # has access to packages' dependencies (e.g think the dependencies of
  # packages/core) without having to bundle packages with the output build
  --shamefully-hoist \
  --filter "${PROJECT}..."

FROM node:22-alpine AS runner

# Required for the health check
RUN apk add --update --no-cache curl

ARG PROJECT_PATH
ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA
ARG PORT=8080

ENV PORT=$PORT
ENV NODE_ENV=production
ENV KEEP_ALIVE_TIMEOUT=601000
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
RUN set -e; \
  mkdir -p /app/storage/files; \
  mkdir -p /app/apps/web/public/files; \
  chown -R 1001:1001 /app/storage/files /app/apps/web/public/files

USER latitude

WORKDIR /app

COPY --from=builder --chown=latitude:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=latitude:nodejs /app/${PROJECT_PATH} ./${PROJECT_PATH}
COPY --from=builder --chown=latitude:nodejs /app/packages/telemetry/typescript ./packages/telemetry/typescript
COPY --from=builder --chown=latitude:nodejs /app/packages/sdks/typescript ./packages/sdks/typescript
COPY --from=builder --chown=latitude:nodejs /app/packages/core/src/assets/eu-central-1-bundle.pem ./packages/core/src/assets/eu-central-1-bundle.pem

WORKDIR /app/${PROJECT_PATH}

CMD ["node", "dist/server.js"]

