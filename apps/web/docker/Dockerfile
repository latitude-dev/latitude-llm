FROM latitudedata/base AS base

WORKDIR /app
COPY . .

RUN turbo prune @latitude-data/web --docker

# COMMON stage (installer)
# ------------------------------------------------------
FROM base AS installer
COPY --from=base /app/out/json/ .
COPY --from=base /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=base /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=base /app/out/full/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --frozen-lockfile \
  --filter "@latitude-data/web..."

# DEVELOPMENT stage
# ------------------------------------------------------
FROM installer AS dev-runner

WORKDIR /app/apps/web
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
CMD pnpm dev

# PRODUCTION stage
# ------------------------------------------------------
FROM installer AS prod-builder

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  BUILDING_CONTAINER=true \
  pnpm turbo build --filter='@latitude-data/web...'

FROM base AS prod-runner

WORKDIR /app-prod

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=installer /app/apps/web/next.config.mjs .
COPY --from=installer /app/apps/web/package.json .
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/web/package.json ./apps/web/package.json

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=prod-builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./apps
COPY --from=prod-builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=prod-builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

ARG PORT=3000
ENV PORT $PORT
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000

CMD HOSTNAME="0.0.0.0" node apps/web/server.js -p $PORT
