FROM latitudedata/base AS installer

WORKDIR /app
COPY . .

ARG NODE_ENV=development

RUN turbo prune @latitude-data/core --docker

FROM installer AS runner

COPY .gitignore .gitignore
COPY --from=installer /app/out/full .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ "$NODE_ENV" = "production" ]; then \
        pnpm install --prod --frozen-lockfile; \
    else \
        pnpm install; \
    fi

WORKDIR /app/packages/core

ENV NODE_ENV $NODE_ENV

# This is for Drizzle studio
EXPOSE 3002

CMD pnpm db:migrate
