ARG PROJECT="@latitude-data/gateway"
ARG PROJECT_PATH="apps/gateway"

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
RUN set -e; \
  mkdir -p /app/storage/files; \
  mkdir -p /app/apps/web/public/files; \
  chown -R 1001:1001 /app/storage/files /app/apps/web/public/files

USER latitude

WORKDIR /app

COPY --from=builder --chown=nodejs:latitude /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:latitude /app/${PROJECT_PATH} ./${PROJECT_PATH}
COPY --from=builder --chown=nodejs:latitude /app/packages/telemetry/typescript ./packages/telemetry/typescript
COPY --from=builder --chown=nodejs:latitude /app/packages/sdks/typescript ./packages/sdks/typescript
COPY --from=builder --chown=nodejs:latitude /app/packages/core/src/assets/eu-central-1-bundle.pem ./packages/core/src/assets/eu-central-1-bundle.pem

WORKDIR /app/${PROJECT_PATH}

ARG PORT=8080

ENV PORT=$PORT
ENV NODE_ENV=production
ENV KEEP_ALIVE_TIMEOUT=601000

EXPOSE $PORT

CMD ["node", "dist/server.js"]

