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

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/gateway ./apps/gateway
COPY tools ./tools
COPY packages ./packages

RUN turbo prune @latitude-data/gateway --docker

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
  --filter "@latitude-data/gateway..."

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  BUILDING_CONTAINER=true \
  pnpm turbo build --filter='@latitude-data/gateway...'

FROM builder AS prod-deps

WORKDIR /app

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm deploy \
  --filter="@latitude-data/gateway" \
  --prod --ignore-scripts --no-optional /dependencies

# PRODUCTION
FROM node:20-alpine
WORKDIR /app-prod

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 latitude
USER latitude

COPY --from=prod-deps --chown=latitude:nodejs /dependencies/node_modules ./node_modules
COPY --from=builder --chown=latitude:nodejs /app/apps/gateway/package.json ./package.json
COPY --from=builder --chown=latitude:nodejs /app/apps/gateway/dist .

ARG PORT=8080

ENV PORT $PORT
ENV NODE_ENV=production

EXPOSE $PORT

CMD node server.js
