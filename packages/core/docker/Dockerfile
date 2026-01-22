ARG PROJECT="@latitude-data/core"

FROM node:22-alpine AS alpine

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

FROM alpine AS base

# Will be used to cache pnpm store
RUN npm install -g corepack@0.31.0 && corepack enable

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN pnpm i -g turbo

FROM base AS runner

ARG PROJECT

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ ./packages/
COPY tools/ ./tools/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install \
  --frozen-lockfile

RUN pnpm build --filter='@latitude-data/telemetry' --filter='@latitude-data/constants'

CMD sh -c "cd /app && pnpm --filter @latitude-data/core db:migrate && pnpm --filter @latitude-data/core scripts:setup"


