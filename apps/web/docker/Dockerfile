ARG PROJECT="@latitude-data/web"
ARG PROJECT_PATH="apps/web"

FROM node:20-alpine AS alpine

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update
RUN apk add --no-cache libc6-compat

FROM alpine as base

# Will be used to cache pnpm store
RUN corepack enable

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN pnpm i -g turbo

FROM base as pruner

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
  BUILDING_CONTAINER=true \
  pnpm turbo build --filter="${PROJECT}..."

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm prune --prod --no-optional
RUN rm -rf ./**/*/src

# PRODUCTION
FROM alpine AS runner

ARG PROJECT_PATH

ENV NODE_ENV=production

# Unpriviledged user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

WORKDIR /app

COPY --from=builder --chown=nodejs:latitude /app .

WORKDIR /app/${PROJECT_PATH}

ARG PORT=8080
ARG HOSTNAME="0.0.0.0"

ENV HOSTNAME $HOSTNAME
ENV PORT $PORT
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE $PORT

CMD node .next/standalone/apps/web/server.js -p $PORT -h $HOSTNAME
