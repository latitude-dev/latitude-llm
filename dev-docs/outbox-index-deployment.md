# Outbox index deployment runbook

## Scope and approval

This runbook covers indexes on `latitude.outbox_events`, not retention jobs, worker changes, or infrastructure settings. The schema declares:

| Index | B-tree key (ascending) | Predicate | Purpose |
| --- | --- | --- | --- |
| `outbox_events_unpublished_idx` | `created_at` | `published = false` | Polling in creation order without scanning published history |
| `outbox_events_published_at_idx` | `published_at` | `published = true` | Bounded cleanup by publication time |

Keep the existing workspace and aggregate-type indexes. Indexes do not delete data. Published rows with a null `published_at` do not satisfy a timestamp retention cutoff.

**Migration generation and execution require explicit authorization.** The generated migration is `packages/platform/db-postgres/drizzle/20261001101132_add-outbox-partial-indexes/`: its snapshot adds only these two indexes, and its finalized SQL uses ordinary `CREATE INDEX IF NOT EXISTS` followed by catalog assertions. Local generation and disposable PGlite tests do not authorize production execution. Production SQL below is an operator procedure requiring separate approval, not a command to run during implementation.

## Why concurrent DDL must run outside Drizzle migrations

The lockfile pins both `drizzle-kit` and `drizzle-orm` to `1.0.0-beta.15-859cf75`. Inspection of these exact packages establishes the execution path:

1. `packages/platform/db-postgres/package.json` runs `drizzle-kit migrate --config=drizzle.config.ts`. The config selects PostgreSQL and `LAT_ADMIN_DATABASE_URL`.
2. Drizzle Kit's `bin.cjs`, in `preparePostgresDB`, selects the installed `pg` driver and delegates migration to `drizzle-orm/node-postgres/migrator`.
3. ORM `node-postgres/migrator.js` reads migration files and calls `pg-core/async/session.js`'s `migrate` function.
4. That function creates the tracking schema/table outside the migration transaction, reads history, then executes **all pending migrations and their history inserts in one `session.transaction`**.
5. `node-postgres/session.js` explicitly sends `begin`, then `commit` on success or `rollback` on failure.
6. `migrator.js` splits SQL on `--> statement-breakpoint`. A breakpoint is only a statement separator, **not a commit boundary**. It computes the SHA-256 hash of each migration SQL file and derives the timestamp from the migration directory name.

Consequently, `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY` cannot be placed in a migration run by this path: PostgreSQL rejects them inside a transaction block. A schema `.concurrently()` flag would generate SQL that this runner cannot execute. Do not insert `COMMIT` into a migration or manually mark it applied in `drizzle.__drizzle_migrations`.

Recheck this path after a Drizzle upgrade or a driver/configuration change. Relevant PostgreSQL contracts: [CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html), [DROP INDEX](https://www.postgresql.org/docs/16/sql-dropindex.html), and [pg_index](https://www.postgresql.org/docs/16/catalog-pg-index.html).

## Generated release artifact

The migration was generated from the schema with explicit local authorization using:

```sh
pnpm --filter @platform/db-postgres pg:generate "add outbox partial indexes"
```

Use the generator; never manually create a file under `drizzle/`. Review the generated snapshot, SQL, and `.migration-lock`. The intended schema delta is only these two indexes. Coordinate with other schema work to avoid unrelated changes and migration ordering conflicts.

The freshly generated SQL was finalized before any real database application with these ordinary index statements:

```sql
CREATE INDEX IF NOT EXISTS "outbox_events_unpublished_idx"
  ON "latitude"."outbox_events" USING btree ("created_at")
  WHERE "latitude"."outbox_events"."published" = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_events_published_at_idx"
  ON "latitude"."outbox_events" USING btree ("published_at")
  WHERE "latitude"."outbox_events"."published" = true;
```

This is an edit to a freshly generated, unapplied migration, not a rewrite of migration history. Preserve the generated snapshot and statement separators; never change an applied migration. Its final `DO` statement rejects either name unless it is an ordinary index in `latitude`, on the exact `latitude.outbox_events` relation, valid, ready, live, non-unique, and B-tree, with `indnkeyatts = indnatts = 1` and no expressions. It requires the expected `timestamptz` column, `indoption[0] = 0` (ascending/nulls last), no collation, and the default `pg_catalog.timestamptz_ops` operator class for that type and access method. The predicates must deparse exactly as `(published = false)` and `(published = true)`; PostgreSQL normalizes ordinary quoting/spacing, but other boolean expressions are deliberately rejected. `IF NOT EXISTS` alone checks only the name, not the definition or validity.

On an empty/local database these ordinary statements create the indexes transactionally. On production the indexes must first be built concurrently and validated, so the same migration only reconciles history. **Post-create assertions cannot prevent a blocking ordinary build if an index is absent. The operator gate below must pass before starting the migration runner.** A populated staging or self-host database that needs online creation must follow the same concurrent procedure before migrating.

PGlite tests execute the finalized SQL transactionally, verify matching precreated index OIDs survive reconciliation, and reject mismatched definitions for either name. A fresh database also runs the full migration history through the real Drizzle migrator and verifies the new tracking timestamp/hash. Invalid/not-ready/not-live rejection is tested by changing actual `pg_index` flags only in disposable PGlite databases; this tests the catalog assertions, not an interrupted multi-session concurrent build. Never change system catalog flags on a real database.

## Production preflight (approved operator only)

Use an approved direct connection to the writer with the table owner/admin role and TLS. Confirm the database and server identity. Coordinate a single operator and pause automated migration deployment until the concurrent builds are validated. Do not pause event delivery just to build these indexes.

Use `psql` with `ON_ERROR_STOP` enabled and autocommit on. Do **not** use `BEGIN`, `--single-transaction`/`-1`, a transaction-wrapping SQL client, or one multi-statement API call for concurrent DDL. Run each build as a separate statement. Concurrent builds allow writes but still scan the table, generate I/O/WAL, and wait for transactions; schedule a low-load window and monitor CPU, read I/O, free space, and replica lag. Build the unpublished index first and the published index second: PostgreSQL allows only one concurrent index build per table at a time.

```sql
\set ON_ERROR_STOP on
\set AUTOCOMMIT on
SELECT current_database(), current_user, inet_server_addr(), pg_is_in_recovery();
SET application_name = 'outbox-index-deployment';
SET lock_timeout = '5s';
SET statement_timeout = '60min';
```

The timeouts are a starting point for operator review, not a capacity guarantee. A timeout can leave an invalid index; never blindly retry with `IF NOT EXISTS`.

Inspect existing objects before creating anything, and repeat this inspection after **each** build and immediately before reconciliation:

```sql
SELECT n.nspname AS index_schema, c.relname AS index_name, c.relkind,
       tn.nspname AS table_schema, t.relname AS table_name,
       am.amname AS access_method,
       i.indisvalid, i.indisready, i.indislive, i.indisunique,
       i.indnkeyatts, i.indnatts,
       a.attname AS key_column, a.atttypid::regtype AS key_type,
       i.indoption[0] AS key_options, i.indcollation[0] AS key_collation,
       opn.nspname AS opclass_schema, op.opcname, op.opcdefault,
       op.opcintype::regtype AS opclass_type, op.opcmethod = am.oid AS opclass_method_matches,
       pg_get_indexdef(c.oid) AS definition,
       pg_get_indexdef(c.oid, 1, true) AS first_key,
       pg_get_expr(i.indpred, i.indrelid) AS predicate,
       pg_get_expr(i.indexprs, i.indrelid) AS expressions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_index i ON i.indexrelid = c.oid
LEFT JOIN pg_class t ON t.oid = i.indrelid
LEFT JOIN pg_namespace tn ON tn.oid = t.relnamespace
LEFT JOIN pg_am am ON am.oid = c.relam
LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
LEFT JOIN pg_opclass op ON op.oid = i.indclass[0]
LEFT JOIN pg_namespace opn ON opn.oid = op.opcnamespace
WHERE n.nspname = 'latitude'
  AND c.relname IN ('outbox_events_unpublished_idx', 'outbox_events_published_at_idx')
ORDER BY c.relname;
```

For each existing name require `relkind = 'i'`, table `latitude.outbox_events`, method `btree`, all three validity/readiness/liveness flags true, uniqueness false, `indnkeyatts = indnatts = 1`, and no expressions. The first key must be `created_at` or `published_at` respectively, of type `timestamp with time zone`, with `key_options = 0` and `key_collation = 0`. Require the default `pg_catalog.timestamptz_ops` class with matching input type and method. Predicates must deparse as `(published = false)` and `(published = true)` respectively. Compare the full definition too. Missing rows mean missing indexes; a same-name non-index object or a different definition is a stop condition, not permission to skip.

For approved repair of a failed build, first confirm no build for that index is still running. If it is invalid and its identity/definition match this runbook, remove it outside a transaction, then rebuild:

```sql
DROP INDEX CONCURRENTLY latitude.outbox_events_unpublished_idx;
```

For a failed published-index build use its own name instead. Do not drop a valid index or an unexpected same-name object without investigating and getting repair approval. Avoid leaving invalid indexes behind: they consume space and can add write overhead without being used for reads.

## Build sequentially

Only run the statement for an index that is absent, or whose failed build has been safely removed. Deliberately omit `IF NOT EXISTS` so an unexpected concurrent change cannot silently skip creation.

```sql
CREATE INDEX CONCURRENTLY outbox_events_unpublished_idx
  ON latitude.outbox_events USING btree (created_at)
  WHERE published = false;
```

Validate the unpublished index using the catalog query before starting the next build:

```sql
CREATE INDEX CONCURRENTLY outbox_events_published_at_idx
  ON latitude.outbox_events USING btree (published_at)
  WHERE published = true;
```

Monitor from a separate approved connection while each statement runs:

```sql
SELECT pid, command, phase, lockers_total, lockers_done, current_locker_pid,
       blocks_total, blocks_done, tuples_total, tuples_done
FROM pg_stat_progress_create_index
WHERE relid = 'latitude.outbox_events'::regclass;
```

If waiting on old transactions, investigate rather than terminating sessions without approval. On failure stop the procedure, inspect catalog state, and use the repair path. Successful command output alone is not the exit gate; both indexes must pass validity and definition checks.

## Plan and migration reconciliation

Refresh statistics in the approved window if needed with `ANALYZE latitude.outbox_events;`. Check representative plans with plain `EXPLAIN` first:

```sql
EXPLAIN
SELECT id, event_name, aggregate_id, workspace_id, payload,
       published, published_at, occurred_at, created_at
FROM latitude.outbox_events
WHERE published = false
ORDER BY created_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;

EXPLAIN
SELECT id FROM latitude.outbox_events
WHERE published = true
  AND published_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY published_at ASC
LIMIT 1000;
```

The poll should be able to use `outbox_events_unpublished_idx` without a full-history scan/sort. The second query only checks index eligibility for cleanup; it does not define the other worker's retention policy or execute a delete. The planner may prefer a sequential scan on small tables or unselective cutoffs. Do not disable sequential scans as evidence of real production benefit. `EXPLAIN ANALYZE` actually executes queries, including row locks or writes; do not analyze cleanup DELETE statements casually.

### Mandatory operator gate before reconciliation

Keep automated migration deployment paused before merging/releasing this artifact into any environment that requires online creation. Do not start the runner until an approved operator completes all of these checks:

1. Confirm the target writer/database identity and independently validate both indexes using the catalog query. If either is absent, invalid, or mismatched, **stop without running `pg:migrate` or the full migration SQL**. Build/repair concurrently with separate approval first.
2. Run **only the final `DO $$ ... $$;` block** from the finalized migration as a standalone catalog-only preflight query on that target, with `ON_ERROR_STOP` enabled. Do not include either `CREATE INDEX` statement. The same assertions must pass before the runner starts; the gate rejects absence without building anything. Keep one operator in control and prohibit concurrent index drops/replacements through reconciliation commit.
3. Review Drizzle history and pending artifacts. Require this to be the only pending migration for the bounded reconciliation window; handle unrelated migrations in separately reviewed releases. The runner holds locks through its entire transaction of all pending migrations.
4. Approve a short write-blocking window and configure short `lock_timeout` and `statement_timeout` on the **runner's own connection**. A skipped ordinary `CREATE INDEX IF NOT EXISTS` still acquires a table `ShareLock`, conflicting with writes, until transaction commit; it is not lock-free. PGlite's real `pg_locks` confirms that skipped path holds `ShareLock`. Settings on the preflight `psql` session do not carry over to the runner. A timeout is a stop condition, not a reason to increase it or retry blindly.

This is an operator/release gate, not an environment-aware SQL guard: the migration intentionally supports absent indexes on fresh databases. Releasing it without the gate permits a full ordinary build on a populated table, and assertions afterwards are too late to prevent those locks. If the deployment automation cannot be held until the gate passes, do not merge/release the migration there.

After this gate passes, deploy the finalized generated migration through the separately authorized release process. With explicit migration execution authorization, the command is:

```sh
pnpm --filter @platform/db-postgres pg:migrate
```

The name-guarded ordinary statements skip rebuilding the already-valid production indexes but still briefly lock the table; the assertions verify the objects, and Drizzle records the migration normally in the same transaction. Do not insert/update tracking rows by hand, use `pg:push`, or use migration initialization to skip outstanding history. Check the resulting `drizzle.__drizzle_migrations` row against the generated migration's timestamp and SQL hash, verify no unexpected pending migrations remain, and rerun the catalog inspection. Test both paths before production: a fresh in-memory/local database that creates the indexes, and a local database with matching pre-created indexes that reconciles them. Also verify that an invalid or mismatched same-name index causes the migration assertions to fail.

Only then resume normal migration deployment. Observe polling latency, sequential scans, Aurora read I/O, and DB load over comparable traffic windows. Indexes increase publication-update write work; monitor that too. If an application release must be rolled back, keep these additive indexes unless a separate approved diagnosis establishes that removal is necessary. Never rewrite the applied migration or drop these indexes as part of an automatic application rollback.
