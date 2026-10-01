# Automated outbox index deployment

## Scope

`pnpm --filter @platform/db-postgres pg:migrate` prepares these indexes before running the existing Drizzle migrator:

| Index | Ascending B-tree key | Predicate | Purpose |
| --- | --- | --- | --- |
| `outbox_events_unpublished_idx` | `created_at` | `published = false` | Poll unpublished events in creation order |
| `outbox_events_published_at_idx` | `published_at` | `published = true` | Bounded cleanup by publication time |

No manual SQL prerequisite or history reconciliation is required. Keep the existing workspace and aggregate-type indexes. These indexes do not delete rows or change retention policy. Published rows with null `published_at` do not satisfy a timestamp retention cutoff.

Migration generation and execution still require explicit authorization. Local tests do not authorize production SQL or a release. The applied `drizzle/20261001101132_add-outbox-partial-indexes/` SQL, snapshot, and history are immutable. The deployment fix is a preflight, not a replacement migration or a manually inserted tracking row.

## Deployment sequence

The package script runs `scripts/migrate.ts`, which uses the existing `drizzle.config.ts` and delegates to `src/migrations/migrate-postgres.ts`:

1. Open one admin `pg.Client` using `LAT_ADMIN_DATABASE_URL`.
2. Acquire the session advisory lock for `latitude:pg:migrate`. A competing deployment using this entrypoint fails with a retryable message before any DDL/history changes. Hold the lock through preflight and all Drizzle migrations; closing the connection releases it on success or failure.
3. If `latitude.outbox_events` exists, require an ordinary table and validate both reserved index names before changing either. Reject unexpected definitions, including same-name non-index objects or indexes on other tables.
4. In autocommit, build missing indexes sequentially with **separate** `CREATE INDEX CONCURRENTLY` queries. No `BEGIN`, embedded `COMMIT`, or multi-statement concurrent-DDL query is used. The unpublished index is first; PostgreSQL permits only one concurrent build per table at a time.
5. For an unhealthy index whose definition matches exactly, refuse repair while `pg_stat_progress_create_index` reports an active build. Otherwise use a separate `DROP INDEX CONCURRENTLY`, then rebuild. Never automatically drop a healthy or mismatched index. Do not use `IF NOT EXISTS` for concurrent creation: an unexpected competing change must fail, not silently skip validation.
6. Validate each completed build and both indexes immediately before handing off to Drizzle.
7. Invoke the same `drizzle-orm/node-postgres/migrator` that Drizzle Kit used, on that connection, with the configured migration folder/schema/table. All pending migration SQL and history inserts retain Drizzle's single-transaction behavior. No history hashes, timestamps, or migration ordering are rewritten.

On a fresh database, the outbox table is absent during preflight. Drizzle creates the table and both indexes transactionally using unchanged history. That table is not externally visible until commit, so concurrent creation is unnecessary. On **any existing outbox table**, even an empty one, preflight builds missing indexes concurrently before the historical ordinary-index statements can run. On an already-migrated database, preflight still checks both indexes and repairs matching interrupted builds or recreates missing indexes, without adding or changing history.

Successful concurrent builds survive a later Drizzle failure. Rerunning `pg:migrate` validates and preserves their OIDs, while Drizzle retries only pending history. If preflight fails, Drizzle is never called. A failed or canceled concurrent build may leave an invalid index; the next invocation repairs it only after confirming its definition and absence of an active build.

## Validation and deployment constraints

Catalog validation requires the index to be an ordinary index in `latitude`, on the exact `latitude.outbox_events` relation, non-unique, non-primary, non-exclusion, and not a replica-identity index. It must use B-tree with one key, no included columns or expressions, and the expected `timestamptz` column. Require ascending/nulls-last (`indoption[0] = 0`), no collation, and the default `pg_catalog.timestamptz_ops` class for the column type and access method. Predicates must deparse exactly as `(published = false)` or `(published = true)`. Other boolean expressions are deliberately rejected rather than guessed equivalent. Healthy indexes require `indisvalid`, `indisready`, and `indislive` all true. A mismatch is an investigation stop, not permission to drop the object.

Preflight sets `lock_timeout = 5s` and `statement_timeout = 60min` only on its own connection during concurrent DDL. It restores the previous session values before invoking Drizzle, including values supplied through connection URL options or `PGOPTIONS`. A timeout fails deployment; it does not silently fall back to ordinary creation. Concurrent builds permit writes but still scan the table, generate I/O/WAL, and wait for older transactions. Review available disk, read I/O, replication lag, and long-running transactions before deployment. A build that cannot complete within the bound needs investigation.

The historical `CREATE INDEX IF NOT EXISTS` statements skip matching prebuilt indexes but still take a table `ShareLock`, conflicting with writes until the **entire pending migration transaction** commits. This change removes blocking index construction on populated upgrades; it does not make the rest of migration deployment lock-free. Existing deployment timeout/window policies still apply. The ordinary statements and their catalog assertions remain intact, and unrelated migrations retain their existing transactional semantics.

Run one migration deployment at a time, on the writer, with the table-owning/admin role. Use the package entrypoint in automation; directly running `drizzle-kit migrate`, `pg:push`, or the historical SQL bypasses preflight. The advisory lock coordinates this entrypoint, not older migration images, manual DDL, or unrelated maintenance. Do not overlap an older/unwrapped migration deployment or manual index replacement with this job. The progress check prevents repairing an already-active external build; it cannot serialize arbitrary external DDL started after inspection. The admin connection must be able to see active index-build progress.

Do not drop these additive indexes on application rollback. Removing them requires a separately reviewed migration or approved diagnosis, not a rewrite of applied history.

## Why not the v1 embedded `COMMIT` pattern?

The resolved lockfile pins both Drizzle ORM and Kit to `1.0.0-beta.15-859cf75`; the root ORM override takes precedence over the workspace catalog. Kit's `preparePostgresDB` selects `pg` and delegates to `drizzle-orm/node-postgres/migrator`. ORM reads SQL separated by `--> statement-breakpoint`, hashes the entire file, and derives timestamps from migration folder names. Its async session runs all pending SQL and tracking inserts in one transaction. A breakpoint is only a statement separator.

The v1 migrations `0119_brainy_dexter_bennett.sql` and `0276_add_custom_identifier_to_spans.sql` explicitly commit that transaction before concurrent DDL. This syntax **does execute** with the current driver/migrator, but breaks failure guarantees:

- A `0119`-style commit makes preceding migrations and their history durable. Subsequent SQL/history run in autocommit, so a later migration failure cannot roll the pending batch back.
- A `0276`-style `ALTER; COMMIT; CREATE INDEX CONCURRENTLY` persists the column before the index/history complete. Canceling the build leaves the column present and its migration untracked; replay then fails on the duplicate column.

Real PostgreSQL tests reproduce both cases. An appended `COMMIT` migration would also run **after** the already-applied ordinary-index migration, too late to protect populated upgrades. The preflight keeps concurrent DDL outside the transaction without changing migration history or implementing a custom migration runner.

Recheck driver and transaction behavior after a Drizzle upgrade. PostgreSQL references: [CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html), [DROP INDEX](https://www.postgresql.org/docs/16/sql-dropindex.html), [pg_index](https://www.postgresql.org/docs/16/catalog-pg-index.html).

## Packaging and environment

The migration Docker target copies `packages/` from `build-migrations`, including `scripts/migrate.ts`, `src/migrations/`, `drizzle.config.ts`, and applied migration artifacts. It installs workspace dependencies without `--prod`, so existing `tsx`, `dotenv`, `pg`, and Drizzle packages remain available. The runtime pruning helper is not used by this target. The container command continues to run `pg:migrate` before ClickHouse `ch:up`; a PostgreSQL failure returns a nonzero exit status and prevents ClickHouse execution.

Environment loading is unchanged: `drizzle.config.ts` selects `.env.${NODE_ENV}` (development by default), does not override supplied environment variables, and reads `LAT_ADMIN_DATABASE_URL`. Container `NODE_ENV=production` and URL TLS/connection options remain supported. No AWS lookup, production credential discovery, new environment variable, or new dependency is needed for deployment. `pg:migrate` accepts no CLI flags; use the configuration and environment variables rather than Drizzle Kit initialization flags. `pg:generate`, `pg:push`, `pg:check`, and `pg:studio` remain Drizzle Kit commands.

## Local verification

The default package tests retain the applied migration's PGlite assertions and schema coverage. PGlite does not prove concurrent DDL. The opt-in `src/migrations/migrate-postgres.integration.test.ts` suite requires an explicitly supplied **loopback-only disposable PostgreSQL server**, creates uniquely named databases, and drops only those databases after each test. Use a PostgreSQL 16 server with the vector extension available to exercise full repository history.

Example using a dedicated local container (not an existing shared database):

```sh
docker run -d --name automated-outbox-indexes-pg \
  -e POSTGRES_USER=latitude -e POSTGRES_PASSWORD=local-only \
  -e POSTGRES_DB=outbox_tests -p 127.0.0.1:55438:5432 pgvector/pgvector:pg16
OUTBOX_TEST_DATABASE_URL=postgres://latitude:local-only@127.0.0.1:55438/outbox_tests \
  pnpm --filter @platform/db-postgres test:migrations:postgres
docker rm -f automated-outbox-indexes-pg
```

The suite verifies full fresh history, a populated upgrade with real DDL audit evidence for **both** concurrent builds, matching-index OID preservation, missing indexes after history is already applied, mismatched objects/definitions, concurrent writes, actual canceled builds before and after readiness, interrupted concurrent drops with a dead index, active-build refusal, deployment serialization, retry after failures, unchanged transactional rollback of unrelated SQL/history, preserved connection timeouts, and the v1 `COMMIT` failure cases. Do not simulate invalid catalog flags on a real PostgreSQL server.
