# ClickHouse Migrations

> [!WARNING]
> **ClickHouse integration is under active development.** Cluster mode is not yet supported.
> Until the infrastructure is ready, only single-node (unclustered) setups are available.
> Do not set `CLICKHOUSE_CLUSTER_ENABLED=true`.

This directory contains the ClickHouse migration system for Latitude. It uses [golang-migrate](https://github.com/golang-migrate/migrate) to manage database schema changes.

## Overview

ClickHouse is used for analytics and high-performance data storage. The migration system supports two deployment modes:

- **Unclustered**: Single-node ClickHouse installations (development, self-hosted)
- **Clustered**: Replicated ClickHouse clusters (production, high-availability)

## Directory Structure

```
clickhouse/
├── migrations/
│   ├── clustered/           # Migrations for replicated cluster setups
│   │   ├── 0001_example.up.sql
│   │   └── 0001_example.down.sql
│   └── unclustered/         # Migrations for single-node setups
│       ├── 0001_example.up.sql
│       └── 0001_example.down.sql
├── scripts/
│   ├── up.sh                # Apply pending migrations
│   ├── down.sh              # Rollback migrations
│   └── drop.sh              # Drop all tables (dangerous!)
└── README.md
```

## Why Two Migration Folders?

ClickHouse has different SQL syntax and engine types depending on whether you're running a single node or a replicated cluster:

### Unclustered (Single-Node)

Used for:
- Local development
- Self-hosted single-node deployments
- Simpler setups without replication

Characteristics:
- Uses standard table engines like `MergeTree`, `ReplacingMergeTree`
- No `ON CLUSTER` clause in DDL statements
- Simpler configuration

Example:
```sql
CREATE TABLE events (
    id String,
    timestamp DateTime64(3),
    data String
) ENGINE = ReplacingMergeTree()
ORDER BY (id, timestamp);
```

### Clustered (Replicated)

Used for:
- Production deployments
- High-availability setups
- Multi-node ClickHouse clusters

Characteristics:
- Uses replicated engines like `ReplicatedMergeTree`, `ReplicatedReplacingMergeTree`
- Requires `ON CLUSTER` clause for DDL statements
- Data is automatically replicated across nodes

Example:
```sql
CREATE TABLE events ON CLUSTER default (
    id String,
    timestamp DateTime64(3),
    data String
) ENGINE = ReplicatedReplacingMergeTree()
ORDER BY (id, timestamp);
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLICKHOUSE_URL` | Yes | `http://localhost:8123` | HTTP URL for application connections |
| `CLICKHOUSE_MIGRATION_URL` | Yes | `clickhouse://localhost:9000` | Native protocol URL for migrations |
| `CLICKHOUSE_DB` | No | `default` | Database name |
| `CLICKHOUSE_USER` | Yes | - | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | Yes | - | ClickHouse password |
| `CLICKHOUSE_CLUSTER_ENABLED` | No | `false` | Set to `true` for clustered mode |
| `CLICKHOUSE_CLUSTER_NAME` | No | `default` | Cluster name (only used when clustered) |
| `CLICKHOUSE_MIGRATION_SSL` | No | `false` | Enable SSL for migration connections |

### URL Formats

- **CLICKHOUSE_URL**: HTTP protocol for application queries
  - Format: `http://host:port` or `https://host:port`
  - Default port: `8123`

- **CLICKHOUSE_MIGRATION_URL**: Native TCP protocol for migrations
  - Format: `clickhouse://host:port`
  - Default port: `9000`

## Scripts

### `ch:connect` - Connect to ClickHouse

Opens an interactive ClickHouse client session via Docker.

```bash
pnpm --filter @latitude-data/core ch:connect
```

### `ch:status` - Show Migration Status

Shows all migrations and their status (applied/pending).

```bash
pnpm --filter @latitude-data/core ch:status
```

### `ch:create` - Create New Migration

Creates migration files in both clustered and unclustered directories.

```bash
pnpm --filter @latitude-data/core ch:create <migration_name>

# Example
pnpm --filter @latitude-data/core ch:create create_events
```

This generates:
```
migrations/unclustered/0001_create_events.up.sql
migrations/unclustered/0001_create_events.down.sql
migrations/clustered/0001_create_events.up.sql
migrations/clustered/0001_create_events.down.sql
```

> [!NOTE]
> Write your unclustered SQL immediately (used in development).
> Write clustered SQL with `ON CLUSTER` and `ReplicatedMergeTree` for production.

### `ch:up` - Apply Migrations

Applies all pending migrations to the database.

```bash
pnpm --filter @latitude-data/core ch:up
```

### `ch:down` - Rollback Migrations

Rolls back N migrations (defaults to 1).

```bash
# Roll back the last migration
pnpm --filter @latitude-data/core ch:down

# Roll back the last 3 migrations
pnpm --filter @latitude-data/core ch:down 3

# Roll back ALL migrations
pnpm --filter @latitude-data/core ch:down all
```

### `ch:drop` - Drop All Tables

Drops all tables managed by migrations. **Use with caution!**

```bash
pnpm --filter @latitude-data/core ch:drop
```

### `ch:reset` - Reset Database

Rolls back all migrations and re-applies them.

```bash
pnpm --filter @latitude-data/core ch:reset
```

## Test Database

A separate test database (`latitude_analytics_test`) is available to avoid losing development data when running tests.

### Test Commands

```bash
# Show test database migration status
pnpm --filter @latitude-data/core ch:status:test

# Apply migrations to test database
pnpm --filter @latitude-data/core ch:up:test

# Rollback migrations in test database
pnpm --filter @latitude-data/core ch:down:test [N|all]

# Reset test database
pnpm --filter @latitude-data/core ch:reset:test
```

The test database is created automatically by `docker/clickhouse/init-db.sql` when the container starts.

## Creating New Migrations

### Prerequisites

Install golang-migrate:

```bash
# macOS
brew install golang-migrate

# Other platforms: https://github.com/golang-migrate/migrate/tree/master/cmd/migrate
```

### Migration File Naming

Migrations follow the naming convention: `NNNN_description.{up,down}.sql`

- `NNNN`: Sequential number (0001, 0002, etc.)
- `description`: Brief description using underscores
- `.up.sql`: Applied when migrating forward
- `.down.sql`: Applied when rolling back

### Steps to Create a Migration

1. **Create the migration files**:

   ```bash
   pnpm --filter @latitude-data/core ch:create create_events
   ```

2. **Write the migration SQL**:

   ```sql
   -- 0001_create_events.up.sql
   CREATE TABLE events (
       id String,
       workspace_id UInt64,
       timestamp DateTime64(3),
       event_type LowCardinality(String),
       data String CODEC(ZSTD(3)),
       created_at DateTime64(3) DEFAULT now()
   ) ENGINE = ReplacingMergeTree()
   PARTITION BY toYYYYMM(timestamp)
   ORDER BY (workspace_id, timestamp, id);
   ```

   ```sql
   -- 0001_create_events.down.sql
   DROP TABLE events;
   ```

3. **Test the migration**:

   ```bash
   pnpm --filter @latitude-data/core ch:up
   ```

### Migration Best Practices

1. **Keep migrations small**: One logical change per migration
2. **Make migrations reversible**: Always provide a working `down.sql`
3. **Test rollbacks**: Verify `ch:down` works before merging
4. **Use appropriate engines**: Choose the right MergeTree variant for your use case
5. **Consider partitioning**: Use `PARTITION BY` for large tables to improve query performance
6. **Include workspace_id**: Always include `workspace_id` in ORDER BY for tenant isolation

## Self-Hosted Deployments

For self-hosted single-node deployments:

1. Set `CLICKHOUSE_CLUSTER_ENABLED=false` (or leave unset)
2. Configure connection URLs pointing to your ClickHouse instance
3. Run migrations with `ch:up`

The system will automatically use the unclustered migrations, which work with standard ClickHouse installations without any cluster configuration.

## Troubleshooting

### "golang-migrate is not installed"

Install it via:
```bash
brew install golang-migrate
```

### "CLICKHOUSE_URL is not configured"

Ensure your `.env` file has the required ClickHouse variables. Copy from `.env.example` if needed.

### Migration stuck in "dirty" state

If a migration fails halfway, the schema_migrations table may be in a dirty state:

```bash
# Connect to ClickHouse and check the state
clickhouse client --host localhost --query "SELECT * FROM schema_migrations"

# Force set the version (use with caution)
migrate -source file://path/to/migrations -database "clickhouse://..." force VERSION
```
