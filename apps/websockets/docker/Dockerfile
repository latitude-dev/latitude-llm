ARG PROJECT="@latitude-data/websockets-server"
ARG PROJECT_PATH="apps/websockets"

FROM node:22-alpine AS alpine

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
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
  --ignore-scripts \
  --shamefully-hoist \
  --filter "${PROJECT}..."

FROM node:22-alpine AS runner

# Required for the health check
RUN apk add --update --no-cache curl

ARG PROJECT_PATH

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 latitude
USER latitude

WORKDIR /app

COPY --from=builder --chown=latitude:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=latitude:nodejs /app/${PROJECT_PATH} ./${PROJECT_PATH}

WORKDIR /app/${PROJECT_PATH}

ARG PORT=8080

ENV PORT=$PORT

EXPOSE $PORT

CMD ["node", "dist/server.js"]

