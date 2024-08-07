FROM node:20-alpine AS base

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update
RUN apk add --no-cache libc6-compat

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

RUN pnpm i -g turbo

WORKDIR /app
COPY . .

RUN turbo prune @latitude-data/web --docker

# BUILDER stage
# ------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=base /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=base /app/out/full/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --frozen-lockfile \
  --filter "@latitude-data/web..." \
  --filter "@latitude-data/core..."

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  BUILDING_CONTAINER=true \
  pnpm turbo build --filter='@latitude-data/web...'

FROM base as prod-deps
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --prod \
  --frozen-lockfile \
  --filter "@latitude-data/web..."

# PRODUCTION
FROM base AS production

WORKDIR /app-prod

# Public files doesn't have the unpriviledged user
COPY --from=base /app/apps/web/public ./apps/web/public

# Unpriviledged user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder /app/apps/web/next.config.mjs .
COPY --from=builder /app/packages ./packages
COPY --from=prod-deps /app/node_modules ./node_modules

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./apps
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

ARG PORT=3000
ENV PORT $PORT

# Configure host name. Important for setting the domain.
ARG HOSTNAME="0.0.0.0"
ENV HOSTNAME $HOSTNAME

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

CMD node apps/web/server.js -p $PORT

