FROM node:20-alpine AS base

ARG DATABASE_URL
ARG NODE_ENV=development

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update
RUN apk add --no-cache libc6-compat

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@8.6.3 --activate

# Install Turbo
RUN pnpm i -g turbo

FROM base AS builder

WORKDIR /app

COPY . .

RUN turbo prune @latitude-data/core --docker

FROM base AS installer

ARG NODE_ENV

WORKDIR /app

COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ "$NODE_ENV" = "production" ]; then \
        pnpm install --prod --frozen-lockfile; \
    else \
        pnpm install; \
    fi

FROM base as runner

ARG NODE_ENV

WORKDIR /app

COPY --from=builder /app/out/full .
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages/core/node_modules ./packages/core/node_modules

WORKDIR /app/packages/core

ENV NODE_ENV $NODE_ENV

# Declare DATABASE_URL env var if it has been passed as a build argument.
# Required for production use case.
RUN if [ "$DATABASE_URL" ]; then \
    export DATABASE_URL; \
  else \
    unset DATABASE_URL; \
  fi

EXPOSE 3000

CMD pnpm db:migrate
