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
COPY package.json .
COPY pnpm-lock.yaml .

COPY . .

RUN turbo prune @latitude-data/workers --docker

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
  --filter "@latitude-data/workers..."

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  BUILDING_CONTAINER=true \
  pnpm turbo build --filter='@latitude-data/workers...'

FROM builder AS prod-deps
WORKDIR /app
# pnpm deploy: https://pnpm.io/cli/deploy
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm deploy \
  --filter="@latitude-data/workers" \
  --prod --ignore-scripts --no-optional /dependencies

# PRODUCTION
FROM node:20-alpine
WORKDIR /app-prod

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 latitude
USER latitude

COPY --from=prod-deps --chown=latitude:nodejs /dependencies/node_modules ./node_modules
COPY --from=builder --chown=latitude:nodejs /app/apps/workers/package.json ./package.json
COPY --from=builder --chown=latitude:nodejs /app/apps/workers/dist .

ENV NODE_ENV=production

CMD node server.js
