ARG PROJECT="@latitude-data/web"
ARG PROJECT_PATH="apps/web"
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_DATADOG_APPLICATION_ID
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SITE
ARG NEXT_PUBLIC_GTM_ID
ARG AWS_REGION
ARG S3_BUCKET
ARG BUILD_ID
ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA


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

# Install turbo globally
RUN pnpm install -g turbo

FROM base AS pruner

ARG PROJECT

WORKDIR /app

COPY . .

RUN turbo prune "${PROJECT}" --docker

# BUILDER stage
# ------------------------------------------------------
FROM base AS builder

ARG AWS_REGION
ARG S3_BUCKET

ARG BUILD_ID

ARG DD_GIT_COMMIT_SHA
ARG DD_GIT_REPOSITORY_URL
ARG DD_SITE

ARG NEXT_PUBLIC_DATADOG_APPLICATION_ID
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SITE
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_GTM_ID
ARG NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_POSTHOG_KEY

ARG PROJECT
ARG STATIC_ASSETS_HOST
ARG NEXT_PUBLIC_STATIC_ASSETS_URL

ENV AWS_REGION=${AWS_REGION:-}
ENV S3_BUCKET=${S3_BUCKET:-}

ENV BUILD_ID=${BUILD_ID:-}

ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA:-}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL:-}
ENV DD_SITE=${DD_SITE:-}

ENV NEXT_PUBLIC_DATADOG_APPLICATION_ID=$NEXT_PUBLIC_DATADOG_APPLICATION_ID
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ENV NEXT_PUBLIC_DATADOG_SITE=$NEXT_PUBLIC_DATADOG_SITE
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL
ENV NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL=$NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY

ENV STATIC_ASSETS_HOST=${STATIC_ASSETS_HOST:-}
ENV NEXT_PUBLIC_STATIC_ASSETS_URL=${NEXT_PUBLIC_STATIC_ASSETS_URL:-}
ENV RELEASE_VERSION=${DD_GIT_COMMIT_SHA:-unknown}

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
  --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  set -a && \
  BUILDING_CONTAINER=true && \
  NEXT_TELEMETRY_DISABLED=1 && \
  NEXT_PUBLIC_NODE_ENV=production && \
  NEXT_PUBLIC_DATADOG_APPLICATION_ID=$NEXT_PUBLIC_DATADOG_APPLICATION_ID && \
  NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN && \
  NEXT_PUBLIC_DATADOG_SITE=$NEXT_PUBLIC_DATADOG_SITE && \
  NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY && \
  NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST && \
  NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL=$NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL && \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY 2>/dev/null || echo '')" && \
  NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL && \
  AWS_REGION=$AWS_REGION && \
  S3_BUCKET=$S3_BUCKET && \
  BUILD_ID=$BUILD_ID && \
  RELEASE_VERSION=$RELEASE_VERSION && \
  NEXT_PUBLIC_RELEASE_VERSION=$RELEASE_VERSION && \
  STATIC_ASSETS_HOST=$STATIC_ASSETS_HOST && \
  NODE_OPTIONS="--max-old-space-size=8192" && \
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

# Upload source maps to Datadog
RUN --mount=type=secret,id=DATADOG_API_KEY \
  if [ -s /run/secrets/DATADOG_API_KEY ]; then \
  echo "Uploading source maps to Datadog..."; \
  export DATADOG_API_KEY="$(cat /run/secrets/DATADOG_API_KEY 2>/dev/null || echo '')" && \
  export DD_SITE=${DD_SITE:-datadoghq.eu} && \
  cd apps/web && \
  echo "Current directory: $(pwd)" && \
  echo "Absolute path: /app/apps/web" && \
  echo "Release version: ${RELEASE_VERSION:-unknown}" && \
  echo "Service: latitude-llm-web" && \
  echo "DD Site: ${DD_SITE}" && \
  echo "" && \
  if [ -n "$NEXT_PUBLIC_STATIC_ASSETS_URL" ]; then \
  CLIENT_MINIFIED_PREFIX="${NEXT_PUBLIC_STATIC_ASSETS_URL}/_next/static/"; \
  else \
  CLIENT_MINIFIED_PREFIX="/_next/static/"; \
  fi && \
  echo "Client minified path prefix: $CLIENT_MINIFIED_PREFIX" && \
  echo "" && \
  echo "=== CLIENT-SIDE SOURCE MAPS (web URLs) ===" && \
  echo "Source map files in .next:" && \
  find .next -name "*.map" -type f | head -10 && \
  echo "" && \
  echo "=== SERVER-SIDE SOURCE MAPS (filesystem paths) ===" && \
  echo "Source map files in .next/server:" && \
  find .next/server -name "*.map" -type f | head -10 && \
  echo "" && \
  echo "Normalizing Turbopack sourcemap names..." && \
  chmod +x ./scripts/normalize-sourcemaps.sh && \
  ./scripts/normalize-sourcemaps.sh .next/static && \
  echo "" && \
  echo "Uploading client-side source maps with prefix: $CLIENT_MINIFIED_PREFIX" && \
  pnpm exec datadog-ci sourcemaps upload .next/static --service=latitude-llm-web --minified-path-prefix="$CLIENT_MINIFIED_PREFIX" --release-version="${RELEASE_VERSION:-unknown}" --disable-git --max-concurrency=20 && \
  echo "" && \
  echo "Uploading server-side source maps with prefix: /app/apps/web/.next/server/" && \
  pnpm datadog:sourcemaps:server; \
  else \
  echo "Skipping Datadog source map upload - DATADOG_API_KEY secret not provided"; \
  fi

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm prune --prod --no-optional

# PRODUCTION
FROM node:22-alpine AS runner

# Required for the health check
RUN apk add --update --no-cache curl

ARG PROJECT_PATH
ARG DD_GIT_REPOSITORY_URL
ARG DD_GIT_COMMIT_SHA

ENV HOSTNAME=0.0.0.0
ENV KEEP_ALIVE_TIMEOUT=601000
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=8080
ENV UV_THREADPOOL_SIZE=128
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL:-}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA:-}
ENV RELEASE_VERSION=${DD_GIT_COMMIT_SHA:-}

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

# Copy the standalone server (dereference symlinks — Turbopack creates
# relative symlinks in standalone/node_modules that break in multi-stage
# Docker builds, see vercel/next.js#89851)
RUN --mount=from=builder,source=/app/apps/web/.next/standalone,target=/mnt/standalone \
  cp -a /mnt/standalone/. ./ && chown -R nextjs:nodejs ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/node_modules ./apps/web/node_modules
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
