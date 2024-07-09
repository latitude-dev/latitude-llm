FROM latitudedata/base AS installer

RUN turbo prune @latitude-data/api --docker

FROM installer AS builder

COPY .gitignore .gitignore
COPY --from=installer /app/out/full .

WORKDIR /app/apps/api

FROM builder AS production

ENV NODE_ENV production

RUN  pnpm install --prod --frozen-lockfile
RUN pnpm build

CMD pnpm start

FROM builder AS development

ENV NODE_ENV development

RUN pnpm install

EXPOSE 3000

CMD pnpm dev
