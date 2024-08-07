FROM node:20-alpine AS base

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update
RUN apk add --no-cache libc6-compat

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

RUN pnpm i -g turbo

FROM base AS builder

WORKDIR /app
COPY . .

RUN turbo prune @latitude-data/web --docker

FROM base AS installer

WORKDIR /app

COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile;

# PRODUCTION
FROM base AS production

WORKDIR /app

# Unpriviledged user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/out/full .
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/web/node_modules ./apps/web/node_modules
# Needed for db migrations
COPY --from=installer /app/packages/core/node_modules ./packages/core/node_modules

RUN rm -fr apps/web

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./apps
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

ARG PORT=3000
ENV PORT $PORT

# Configure host name. Important for setting the domain.
ARG HOSTNAME="0.0.0.0"
ENV HOSTNAME $HOSTNAME

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

CMD node apps/web/server.js -p $PORT
