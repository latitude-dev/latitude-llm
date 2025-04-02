ARG PROJECT="@latitude-data/workers"
ARG PROJECT_PATH="apps/workers"

FROM node:22-alpine AS alpine

# Install build dependencies
RUN apk add --no-cache libc6-compat curl

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

WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --shamefully-hoist \
  --frozen-lockfile \
  --filter "${PROJECT}..."

COPY --from=pruner /app/out/full/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  --mount=type=secret,id=SENTRY_AUTH_TOKEN \
  BUILDING_CONTAINER=true \
  SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN 2>/dev/null || echo '')" \
  pnpm turbo build --filter="${PROJECT}..."

# Run sentry:sourcemaps if SENTRY_AUTH_TOKEN secret is present and not empty
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
  if [ -s /run/secrets/SENTRY_AUTH_TOKEN ]; then \
  cd ${PROJECT_PATH} && \
  SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)" pnpm sentry:sourcemaps; \
  fi

# Since `pnpm prune` doesn't handle recursive dependencies effectively,
# we follow pnpm's recommended approach: remove node_modules entirely
# and perform a fresh production install with --frozen-lockfile
RUN rm -fr node_modules
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --prod \
  --frozen-lockfile \
  --shamefully-hoist \
  --filter "${PROJECT}..."

FROM alpine AS runner

ARG PROJECT_PATH

ENV NODE_ENV=production

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

COPY --from=builder --chown=nodejs:latitude /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:latitude /app/${PROJECT_PATH} ./${PROJECT_PATH}
COPY --from=builder --chown=nodejs:latitude /app/packages/compiler ./packages/compiler
COPY --from=builder --chown=nodejs:latitude /app/packages/core/src/assets/eu-central-1-bundle.pem ./packages/core/src/assets/eu-central-1-bundle.pem

WORKDIR /app/${PROJECT_PATH}

ARG PORT=8080

ENV PORT=$PORT
ENV NODE_ENV=production

EXPOSE $PORT

CMD ["node", "dist/server.js"]

