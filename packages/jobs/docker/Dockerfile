FROM latitudedata/base AS base

WORKDIR /app

COPY . .

RUN turbo prune @latitude-data/jobs --docker

FROM base AS installer

ENV NODE_ENV=production

WORKDIR /app

COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
        pnpm install --prod --frozen-lockfile;

FROM base as runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/out/full .
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages/jobs/node_modules ./packages/jobs/node_modules

WORKDIR /app/packages/jobs

EXPOSE 3000

CMD pnpm start
