# ClickHouse and Weaviate

**When to use:** ClickHouse queries, Goose migrations, chdb test schema, Weaviate collections/migrations, or telemetry storage paths.

## ClickHouse queries

ClickHouse adapter stack remains SQL-oriented in `packages/platform/db-clickhouse`.

**All ClickHouse queries must use parameterized bindings** (`{name:Type}` syntax with `query_params`) — never interpolate user-supplied values directly into SQL strings.

## ClickHouse migrations (Goose)

**Install goose** (if not already installed):

```bash
brew install goose
```

Migration files live in `packages/platform/db-clickhouse/clickhouse/migrations/`:

- `unclustered/` — single-node deployments (local dev, default)
- `clustered/` — distributed deployments (`CLICKHOUSE_CLUSTER_ENABLED=true`)

Goose tracks applied migrations automatically in the `goose_db_version` table (no manual registry).

### Migration execution safety (agents)

Same rule as Postgres: **do not run** `ch:*` or `ch:schema:dump` unless the user explicitly asked in this conversation.

**Commands (run from repo root):**

```bash
# Apply all pending migrations
pnpm --filter @platform/db-clickhouse ch:up

# Roll back last migration
pnpm --filter @platform/db-clickhouse ch:down

# Show migration status
pnpm --filter @platform/db-clickhouse ch:status

# Create a new migration (creates timestamp-named files in both unclustered/ and clustered/)
pnpm --filter @platform/db-clickhouse ch:create <migration_name>

# Convert timestamp migrations to sequential order (run before merging a PR)
pnpm --filter @platform/db-clickhouse ch:fix

# Roll back ALL migrations (equivalent to drop)
pnpm --filter @platform/db-clickhouse ch:drop

# Reset ClickHouse volume and re-migrate (nuclear option)
pnpm --filter @platform/db-clickhouse ch:reset

# Seed sample span data
pnpm --filter @platform/db-clickhouse ch:seed
```

### Creating migrations (hybrid versioning)

1. `ch:create <name>` — creates `20260305120000_name.sql` in both `unclustered/` and `clustered/`
2. Fill in both files (see rules below)
3. Before merging the PR, run `ch:fix` — renames timestamp files to the next sequential number (e.g. `00002_name.sql`) and commits the renamed files

### Migration file rules

- Each migration is a single `.sql` file with `-- +goose Up` and `-- +goose Down` sections
- Always include `-- +goose NO TRANSACTION` (ClickHouse does not support transactions)
- ClickHouse migration history is append-only in this repository. Do not edit existing Goose migration files; add a new migration in both `unclustered/` and `clustered/` instead.
- For additive changes to existing tables, prefer ordinary `ALTER TABLE` or additive projection migrations with sensible defaults unless the change truly requires a table rebuild.
- `unclustered/`: use standard table engines (e.g. `ReplacingMergeTree`)
- `clustered/`: add `ON CLUSTER default` and use `Replicated*` engines

## Weaviate collections and migrations

Use the dedicated Weaviate package for connection and schema bootstrapping:

- **Connection API:** `packages/platform/db-weaviate/src/client.ts` — `createWeaviateClient()` and `createWeaviateClientEffect()` connect and perform health checks.
- **Collection definitions:** `packages/platform/db-weaviate/src/collections.ts` — define all collections in code via `defineWeaviateCollections([...])`.
- **Migration logic:** `packages/platform/db-weaviate/src/migrations.ts` — idempotent: checks `collections.exists()` before create and tolerates "already exists" race conditions.
- **Manual migration command:** `pnpm --filter @platform/db-weaviate wv:migrate` — entrypoint is `packages/platform/db-weaviate/src/migrate.ts`.

### Rules

- Do not define Weaviate collections in app/domain packages.
- Do not add ad-hoc Weaviate migration scripts outside `packages/platform/db-weaviate`.
- Keep collection schema changes centralized in `src/collections.ts` and rely on the package migration flow.

### Weaviate migrations (agents)

Do not run `wv:migrate` unless the user explicitly asked in this conversation.
