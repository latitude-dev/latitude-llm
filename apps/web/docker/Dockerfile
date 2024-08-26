FROM node:20-alpine AS base

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update
RUN apk add --no-cache libc6-compat

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm i -g pnpm
RUN pnpm i -g turbo

WORKDIR /app

# Copy necessary files for the monorepo
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY tools ./tools
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/next-env.d.ts ./apps/web/next-env.d.ts
COPY apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY apps/web/postcss.config.js ./apps/web/postcss.config.js
COPY apps/web/public ./apps/web/public
COPY apps/web/src ./apps/web/src
COPY apps/web/tailwind.config.js ./apps/web/tailwind.config.js
COPY apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY apps/web/.eslintrc.json ./apps/web/.eslintrc.json

# Prune the workspace for the web app
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

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max_old_space_size=4096"

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  BUILDING_CONTAINER=true \
  pnpm turbo build --filter='@latitude-data/web...'

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
COPY --from=builder /app/node_modules ./node_modules

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./apps
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

ARG PORT=8080
ARG HOSTNAME="0.0.0.0"

ENV HOSTNAME $HOSTNAME
ENV PORT $PORT
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE $PORT

CMD node apps/web/server.js -p $PORT -h $HOSTNAME
