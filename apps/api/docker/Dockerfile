FROM latitudedata/base AS base

WORKDIR /app
COPY . . 

RUN turbo prune @latitude-data/api --docker

FROM base AS builder

COPY .gitignore .gitignore
COPY --from=base /app/out/full .

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
