FROM latitudedata/base AS installer

ARG NODE_ENV=development

RUN turbo prune @latitude-data/api --docker

FROM installer AS runner

COPY .gitignore .gitignore
COPY --from=installer /app/out/full .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ "$NODE_ENV" = "production" ]; then \
        pnpm install --prod --frozen-lockfile; \
    else \
        pnpm install; \
    fi

WORKDIR /app/apps/api

RUN if [ "$NODE_ENV" = "production" ]; then \
        pnpm build; \
    fi

ENV NODE_ENV $NODE_ENV

EXPOSE 3000

CMD pnpm start
