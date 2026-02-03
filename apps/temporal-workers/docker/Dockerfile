ARG PROJECT="@latitude-data/temporal-workers"
ARG PROJECT_PATH="apps/temporal-workers"
ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA

FROM node:22-alpine AS alpine

RUN apk add --no-cache libc6-compat curl python3 make g++ gcc

FROM alpine AS base

RUN npm install -g corepack@0.31.0 && corepack enable

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

ENV RELEASE_VERSION=${DD_GIT_COMMIT_SHA:-unknown}

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

RUN rm -fr node_modules
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --prod \
  --frozen-lockfile \
  --shamefully-hoist \
  --filter "${PROJECT}..."

# RUNNER stage
# ------------------------------------------------------
FROM node:22-alpine AS runner

RUN apk add --update --no-cache curl

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

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 latitude
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

WORKDIR /app/${PROJECT_PATH}

CMD ["node", "dist/server.js"]
