ARG PROJECT="@latitude-data/web"
ARG PROJECT_PATH="apps/web"
ARG NEXT_PUBLIC_SENTRY_WEB_DSN
ARG NEXT_PUBLIC_DOCS_URL
ARG SENTRY_ORG
ARG SENTRY_PROJECT


FROM node:22-alpine AS alpine

# Install build dependencies
RUN apk add --update --no-cache \
  libc6-compat \
  curl \
  sudo \
  build-base \
  g++ \
  bash \
  wget \
  cmake \
  musl-dev \
  clang \
  llvm \
  python3 \
  pkgconfig \
  pixman-dev \
  cairo-dev \
  pango-dev \
  jpeg-dev \
  giflib-dev \
  librsvg-dev \
  rustup \
  git \
  gn \
  tar \
  ninja

FROM alpine AS base

# Will be used to cache pnpm store
RUN npm install -g corepack@0.31.0 && corepack enable

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install turbo with npm instead of pnpm to avoid key verification issues
RUN pnpm install -g turbo

FROM base AS pruner

ARG PROJECT

WORKDIR /app

COPY . .

RUN turbo prune "${PROJECT}" --docker

# BUILDER stage
# ------------------------------------------------------
FROM base AS builder

ARG PROJECT
ARG NEXT_PUBLIC_SENTRY_WEB_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL

ARG NEXT_PUBLIC_DOCS_URL

ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL=$NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL
ENV NEXT_PUBLIC_SENTRY_WEB_DSN=$NEXT_PUBLIC_SENTRY_WEB_DSN

ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL

ARG AWS_REGION
ARG S3_BUCKET
ARG BUILD_ID

ENV AWS_REGION=$AWS_REGION
ENV S3_BUCKET=$S3_BUCKET
ENV BUILD_ID=$BUILD_ID

# Set static assets URL for build time
ENV NEXT_PUBLIC_STATIC_ASSETS_URL=https://$S3_BUCKET.s3.$AWS_REGION.amazonaws.com/static-assets/$BUILD_ID

WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/full/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --frozen-lockfile \
  --ignore-scripts \
  --filter "${PROJECT}..."

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  --mount=type=secret,id=SENTRY_AUTH_TOKEN \
  --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  BUILDING_CONTAINER=true \
  NEXT_TELEMETRY_DISABLED=1 \
  SENTRY_ORG=$SENTRY_ORG \
  SENTRY_PROJECT=$SENTRY_PROJECT \
  SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN 2>/dev/null || echo '')" \
  NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
  NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
  NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL=$NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL \
  NEXT_PUBLIC_SENTRY_WEB_DSN=$NEXT_PUBLIC_SENTRY_WEB_DSN \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY 2>/dev/null || echo '')" \
  NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL \
  AWS_REGION=$AWS_REGION \
  S3_BUCKET=$S3_BUCKET \
  BUILD_ID=$BUILD_ID \
  NEXT_PUBLIC_STATIC_ASSETS_URL=$NEXT_PUBLIC_STATIC_ASSETS_URL \
  NODE_OPTIONS="--max-old-space-size=8192" \
  pnpm turbo build --filter="${PROJECT}..."

# Upload static assets to S3 for persistent availability

# Install AWS CLI v2 for S3 uploads
RUN if [ -n "$S3_BUCKET" ] && [ -n "$BUILD_ID" ]; then \
  apk add --no-cache aws-cli; \
fi

RUN --mount=type=secret,id=AWS_ACCESS_KEY_ID \
  --mount=type=secret,id=AWS_SECRET_ACCESS_KEY \
  if [ -n "$S3_BUCKET" ] && [ -n "$BUILD_ID" ]; then \
  echo "Uploading static assets to S3..."; \
  export AWS_ACCESS_KEY_ID="$(cat /run/secrets/AWS_ACCESS_KEY_ID 2>/dev/null || echo '')" && \
  export AWS_SECRET_ACCESS_KEY="$(cat /run/secrets/AWS_SECRET_ACCESS_KEY 2>/dev/null || echo '')" && \
  chmod +x ./apps/web/scripts/upload-static-assets.sh && \
  cd apps/web && \
  ./scripts/upload-static-assets.sh; \
else \
  echo "Skipping S3 upload - S3_BUCKET or BUILD_ID not provided"; \
fi

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm prune --prod --no-optional

# PRODUCTION
FROM alpine AS runner

ARG PROJECT_PATH
ARG AWS_REGION
ARG S3_BUCKET
ARG BUILD_ID

ENV HOSTNAME=0.0.0.0
ENV KEEP_ALIVE_TIMEOUT=601000
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=8080

# Set static assets URL for runtime
ENV NEXT_PUBLIC_STATIC_ASSETS_URL=https://$S3_BUCKET.s3.$AWS_REGION.amazonaws.com/static-assets/$BUILD_ID

WORKDIR /app

# Install runtime dependencies for canvas
RUN apk add --no-cache \
  pixman \
  cairo \
  pango \
  libjpeg \
  giflib \
  librsvg \
  libstdc++

# Install AWS CLI using Alpine package manager
RUN apk add --no-cache \
  aws-cli \
  groff \
  less

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/core/src/assets /app/packages/core/src/assets
COPY --from=builder /app/apps/web/public ./apps/web/public

# Set the correct permission for prerender cache
RUN mkdir -p apps/web/.next
RUN mkdir -p apps/web/.next/cache
RUN chown nextjs:nodejs apps/web/.next
RUN chown nextjs:nodejs apps/web/.next/cache

# Copy the standalone server and node_modules
COPY --from=builder --chown=nodejs:nextjs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nodejs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nodejs:nextjs /app/apps/web/node_modules ./apps/web/node_modules
# Set permissions for local storage
# User ID and Group ID 1001 is used to match the user 'nextjs' and group 'nodejs' in the runner image.
RUN set -e; \
  mkdir -p /app/storage/files; \
  mkdir -p /app/apps/web/public/files; \
  chown -R 1001:1001 /app/storage/files /app/apps/web/public/files

USER nextjs

WORKDIR /app/apps/web

EXPOSE 8080

CMD ["node", "server.js"]
