# Cloud Development Environment

Instructions for running the Latitude LLM development environment in Cursor Cloud VMs.

## Infrastructure

Docker Compose manages the required infrastructure services. Start them before running dev servers:

```bash
sudo dockerd &>/tmp/dockerd.log &  # if Docker daemon is not running
docker compose up -d db redis clickhouse mailpit
```

Required services: **PostgreSQL** (5432), **Redis** (6379), **ClickHouse** (8123/9000), **Mailpit** (8025/1025, optional but convenient for email testing).

## Environment Variable Gotcha

The Cloud VM injects secrets that use Docker Compose service names as hostnames (e.g., `CACHE_HOST=redis`, `QUEUE_HOST=redis`, `DATABASE_URL=...@db:5432/...`, `GATEWAY_HOSTNAME=gateway`). These must be overridden to point to `localhost` for local development. Key overrides needed:

- `DATABASE_URL` — change host from `db` to `localhost`, database to the development one
- `CACHE_HOST`, `QUEUE_HOST` — change from `redis` to `localhost`
- `CACHE_PASSWORD` — clear if not set on local Redis
- `GATEWAY_HOSTNAME`, `GATEWAY_BIND_ADDRESS` — change from `gateway` to `localhost`
- `GATEWAY_PORT`, `GATEWAY_BIND_PORT` — set to `8787`
- `APP_URL` — set to the local web dev server URL (port 3000)
- `WEBSOCKETS_SERVER` — set to the local websockets dev URL (port 4002)
- `CLICKHOUSE_URL` — HTTP URL pointing to localhost:8123
- `CLICKHOUSE_MIGRATION_URL` — native protocol URL pointing to localhost:9000
- `CLICKHOUSE_DB`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` — match the docker-compose dev defaults

See `.env.example` and `packages/env/src/index.ts` for the full list of expected variables and their dev defaults. The `packages/env` module uses `dotenv.populate` which does **not** override existing env vars, so shell exports take precedence.

## Running Services

See `.tmuxinator.yml` for the canonical dev setup. The key commands are:

1. **Infrastructure**: `docker compose up db redis mailpit clickhouse --menu=false`
2. **Apps**: `pnpm catchup && NODE_OPTIONS=--max_old_space_size=4096 pnpm dev --filter='./apps/*'`
3. **Drizzle Studio** (DB GUI, port 3003): `cd packages/core && pnpm db:studio`

The `NODE_OPTIONS=--max_old_space_size=4096` flag is important to avoid OOM on the dev servers. The `--filter='./apps/*'` flag starts all four app services (web, gateway, workers, websockets) via Turborepo.

## ClickHouse Migrations

Requires `golang-migrate` (install via `curl -L https://github.com/golang-migrate/migrate/releases/download/v4.17.0/migrate.linux-amd64.tar.gz | sudo tar xvz -C /usr/local/bin`). Run with:

```bash
pnpm --filter @latitude-data/core ch:up       # dev database
pnpm --filter @latitude-data/core ch:up:test   # test database
```

## Running Tests

Per AGENTS.md guidelines: `cd` into the package directory and run `pnpm test`. Never use `--filter` for tests. The test database migrations run automatically via the `db:migrate:test` script in `packages/core`. ClickHouse test migrations must be applied separately with `ch:up:test`.

## Auth in Development

The app uses passwordless (magic link) authentication. In dev mode with `MAIL_TRANSPORT=mailpit`, confirmation emails are sent to Mailpit at `http://localhost:8025`.
