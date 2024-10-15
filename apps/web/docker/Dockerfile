ARG PROJECT="@latitude-data/web"
ARG PROJECT_PATH="apps/web"
ARG SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN

FROM node:20-alpine AS alpine

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update
RUN apk add --no-cache libc6-compat curl

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
ARG SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST

ENV SENTRY_DSN=$SENTRY_DSN
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST

WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/full/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --frozen-lockfile \
  --filter "${PROJECT}..."

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  BUILDING_CONTAINER=true \
  NEXT_TELEMETRY_DISABLED=1 \
  SENTRY_ORG=$SENTRY_ORG \
  SENTRY_PROJECT=$SENTRY_PROJECT \
  SENTRY_DSN=$SENTRY_DSN \
  SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
  NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
  NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
  pnpm turbo build --filter="${PROJECT}..."

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm prune --prod --no-optional

# PRODUCTION
FROM alpine AS runner

ARG PROJECT_PATH

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/core/src/assets /app/packages/core/src/assets
COPY --from=builder /app/apps/web/public ./apps/web/public

# Set the correct permission for prerender cache
RUN mkdir -p apps/web/.next
RUN chown nextjs:nodejs apps/web/.next

COPY --from=builder --chown=nodejs:nextjs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nodejs:nextjs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

WORKDIR /app/apps/web

ARG PORT=8080
ARG HOSTNAME="0.0.0.0"

ENV HOSTNAME $HOSTNAME
ENV PORT $PORT
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE $PORT

CMD node server.js -p $PORT -h $HOSTNAME
