ARG PROJECT="@latitude-data/gateway"
ARG PROJECT_PATH="apps/gateway"

FROM node:20-alpine AS alpine

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

WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
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
  cd apps/gateway && \
  SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)" pnpm sentry:sourcemaps; \
  fi

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm prune --prod --no-optional

FROM alpine AS runner

ARG PROJECT_PATH

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 latitude
USER latitude

WORKDIR /app

COPY --from=builder --chown=nodejs:latitude /app .

WORKDIR /app/${PROJECT_PATH}

ARG PORT=8080

ENV PORT=$PORT
ENV NODE_ENV=production
ENV KEEP_ALIVE_TIMEOUT=601000

EXPOSE $PORT

CMD ["node", "dist/server.js"]

