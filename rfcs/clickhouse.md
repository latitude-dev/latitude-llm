# ClickHouse Spans Migration

## 1. Problem Statement

Latitude records OpenTelemetry spans in Postgres (`packages/core/src/schema/models/spans.ts:16`).
This table is the backbone for:

- Ingesting spans in bulk (`packages/core/src/services/tracing/spans/processBulk.ts:260`)
- Serving traces and span lists (`packages/core/src/repositories/spansRepository.ts:18`)
- UI/API endpoints that page over traces and aggregate per document
  (`apps/web/src/app/api/projects/[projectId]/commits/[commitUuid]/documents/[documentUuid]/spans/route.ts:1`)

Postgres limits our ability to run high-frequency, multi-dimensional analytics
(e.g. cost per provider per day) and is expensive long-term. We need a
time-series/analytical store that scales with volume and supports richer
aggregations.

## 2. Goals

1. Analytical Queries: Enable aggregations (cost, tokens, latency) sliced by
   time, provider, model, workspace, etc.
2. Ingestion Throughput: Handle high write throughput with minimal contention.
3. Operational Efficiency: Simplify retention management and provide cheap
   long-term storage.
4. Backward Compatibility: Preserve existing APIs and UI flows during migration.
5. Simplicity: Use a single ClickHouse spans table.
6. Tiered Retention: Free tier retains 30 days, paid tier retains indefinitely.

## 3. Non-Goals

- Changing span metadata storage (S3 + Redis) beyond exposing selected fields for
  analytics.
- Redesigning the public telemetry SDKs.
- Replacing existing Postgres usage outside the spans table.
- Materialized rollups or pre-aggregations (deferred to a later phase).

## 4. Current State Summary

| Aspect   | Notes                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Schema   | Composite PK `(trace_id, id)`, foreign keys to workspaces/api_keys, BRIN/BTREE indexes.                             |
| Ingest   | `processSpansBulk` dedupes by querying Postgres, inserts with `.returning()`, saves metadata to disk, emits events. |
| Reads    | `SpansRepository` composes Drizzle queries for trace assembly, pagination, list-by-log.                             |
| Metadata | Stored as JSON blobs on disk/S3 (keyed by workspace/trace/span) and cached in Redis.                                |
| Scale    | 300M+ rows in production, ~1.5M new rows/day.                                                                       |

## 5. Proposed Architecture

### 5.1 ClickHouse Deployment

- Service: Managed ClickHouse (e.g. Altinity.Cloud or ClickHouse Cloud);
  developers use Docker (extend `docker-compose.local.yml`).
- Client: Add a typed wrapper in `packages/core/src/client` using
  `@clickhouse/client`. Provide health checks and metrics (pool usage, latency).
- Configuration: `CLICKHOUSE_HOST`, `CLICKHOUSE_DATABASE`, `CLICKHOUSE_USERNAME`,
  `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_TLS`.
- Storage policy: hot + cold volumes. Cold volume is backed by S3. TTL moves old
  data to the cold volume.

### 5.2 Table Definition (single spans table)

```sql
CREATE TABLE telemetry.spans (
  workspace_id UInt64,
  trace_id FixedString(32),
  span_id FixedString(16),
  parent_id Nullable(FixedString(16)),
  previous_trace_id Nullable(FixedString(32)),

  api_key_id UInt64,
  document_log_uuid Nullable(UUID),
  document_uuid Nullable(UUID),
  commit_uuid Nullable(UUID),
  experiment_uuid Nullable(UUID),
  project_id Nullable(UInt64),
  test_deployment_id Nullable(UInt64),

  name String,
  kind LowCardinality(String),
  type LowCardinality(String),
  status LowCardinality(String),
  message Nullable(String),
  duration_ms UInt64,
  started_at DateTime64(6, 'UTC'),
  ended_at DateTime64(6, 'UTC'),
  source Nullable(String),

  provider LowCardinality(String),
  model Nullable(String),
  cost Int64,
  tokens_prompt Nullable(UInt32),
  tokens_cached Nullable(UInt32),
  tokens_reasoning Nullable(UInt32),
  tokens_completion Nullable(UInt32),

  ingested_at DateTime64(6, 'UTC'),
  retention_expires_at DateTime64(6, 'UTC'),

  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_document_uuid document_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_commit_uuid commit_uuid TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(started_at)
PRIMARY KEY (workspace_id, toDate(started_at))
ORDER BY (workspace_id, started_at, trace_id, span_id)
TTL
  started_at + INTERVAL 90 DAY TO VOLUME 'cold',
  retention_expires_at DELETE;
```

#### Justification

- Partitioning: Monthly partitions balance pruning efficiency and manageable
  part counts at current volume (~45M rows/month).
- Ordering: Time-first order supports recency navigation and time-range
  analytics.
- ReplacingMergeTree: OTEL can resend spans with updated fields; latest row wins
  by `ingested_at`.
- Bloom indexes: Fast lookups on IDs that are not in the sort key.
- Tiered retention: Move old data to S3 while deleting free-tier data by row.

### 5.3 Metadata Strategy

- Keep full metadata blobs on disk/S3 with Redis caching
  (`SpanMetadatasRepository` remains unchanged).
- Extract analytics-relevant fields (provider, model, cost, tokens, experiment)
  during ingest and insert into ClickHouse columns.
- Optional future: add `metadata Map(...)` if filterable arbitrary keys are
  required.

## 6. Ingestion Pipeline Updates

### 6.1 Dual Writes

- `CLICKHOUSE_SPANS_WRITE`: enable ClickHouse insert while keeping Postgres
  authoritative.
- `CLICKHOUSE_SPANS_READ`: switch repositories/endpoints to ClickHouse.
- Flags default to `false`; set via env or config store.

### 6.2 Updated Flow (`processSpansBulk`)

1. Existing preprocessing logic remains (validation, metadata extraction).
2. Create a `ClickHouseSpansWriter` that:
   - Builds insert rows (includes `ingested_at = now64(6)`).
   - Uses async HTTP insert with retry/backoff.
   - Records metrics (success, retries, latency).
3. Maintain in-batch dedupe (Set of `${traceId}-${spanId}`) to reduce
   duplicates.
4. Rely on `ReplacingMergeTree(ingested_at)` to collapse duplicates over time.
5. Continue publishing `spanCreated` events from application logic (based on
   deduped set).
6. Set `retention_expires_at` based on plan:
   - Free tier: `started_at + 30 days`
   - Paid tier: far-future date (e.g. `2100-01-01`)

## 7. Read Path Migration

### 7.1 Repository Interface

- Abstract `SpansRepository` into an interface (`ISpansRepository`) implemented
  by:
  - `PostgresSpansRepository` (existing)
  - `ClickHouseSpansRepository` (new)
- Use dependency injection in services (assembleTrace, API routes) to select
  implementation based on `CLICKHOUSE_SPANS_READ`.

### 7.2 Query Patterns

#### Recent spans list (keyset pagination)

```sql
SELECT *
FROM spans
WHERE workspace_id = ?
  AND (started_at, span_id) < (?, ?)
ORDER BY started_at DESC, span_id DESC
LIMIT ?;
```

#### Single span (latest version)

```sql
SELECT *
FROM spans
WHERE workspace_id = ?
  AND trace_id = ?
  AND span_id = ?
ORDER BY ingested_at DESC
LIMIT 1;
```

#### Trace detail (strictly deduped)

```sql
SELECT *
FROM spans FINAL
WHERE workspace_id = ?
  AND trace_id = ?
ORDER BY started_at, span_id;
```

#### Group by document log (eventual consistency is acceptable)

```sql
SELECT
  document_log_uuid,
  count() AS spans_count,
  min(started_at) AS first_started_at,
  max(started_at) AS last_started_at,
  sum(cost) AS total_cost
FROM spans
WHERE workspace_id = ?
  AND started_at >= ?
  AND document_log_uuid IS NOT NULL
GROUP BY document_log_uuid
ORDER BY last_started_at DESC
LIMIT ?;
```

#### Daily cost (eventual consistency)

```sql
SELECT
  toDate(started_at) AS day,
  provider,
  sum(cost) AS total_cost
FROM spans
WHERE workspace_id = ?
  AND started_at >= ?
GROUP BY day, provider
ORDER BY day ASC;
```

### 7.3 API & UI Impact

- Responses must match existing types (`Span`, `SpanWithDetails`).
- UI pagination moves to keyset cursors (`started_at`, `span_id`).
- Old data queries may be slower due to cold storage.

## 8. Migration & Backfill Plan

### 8.1 Historical Data Backfill (optional)

- Build a `SyncSpansToClickHouseJob`:
  - Read Postgres spans ordered by `workspace_id, started_at`.
  - Insert to ClickHouse in batches per workspace/month.
  - Compute `retention_expires_at` during backfill.
  - Track progress via checkpoint table or Redis key.

### 8.2 Rollout Sequence

1. Provision ClickHouse + staging environment.
2. Enable `CLICKHOUSE_SPANS_WRITE` in staging; run ingest tests.
3. Backfill staging data (optional) and validate queries.
4. Enable dual-write in production.
5. (Optional) Run production backfill until parity is acceptable.
6. Enable `CLICKHOUSE_SPANS_READ` for internal consumers; gather feedback.
7. Flip read flag for production once metrics stay healthy for agreed window.
8. Disable Postgres writes, schedule removal of spans table and indexes.

## 9. Retention Semantics

- Free tier: rows expire at `started_at + 30 days`.
- Paid tier: rows set `retention_expires_at` far in the future to keep data
  indefinitely.
- Upgrade (free -> paid): applies only to new data. Expired data is not
  restored.
- Plan retention changes are forward-only. Existing rows keep their original
  `retention_expires_at` unless a manual mutation is executed.
- Data older than 90 days moves to S3 (cold volume). Queries against cold data
  may be slower but remain supported.

## 10. Risks & Mitigations

| Risk                           | Mitigation                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Duplicate spans before merges  | In-batch dedupe; use `FINAL` for trace detail when strict correctness is needed. |
| All-time aggregations get slow | Phase 2 rollups or materialized views (deferred).                                |
| TTL is asynchronous            | Document that deletes/moves occur during merges.                                 |
| Plan downgrade retention       | Background delete job can enforce shorter retention if required.                 |
| Increased infra complexity     | Document ClickHouse operations and add monitoring.                               |

## 11. Open Questions

1. Confirm storage policy volume names (hot/cold) and S3 configuration.
2. Confirm the exact cost unit/scale (keep current integer scale unless changed).
3. Validate the 90-day move-to-S3 threshold for production.

## 12. Next Actions

1. Gather feedback from platform/data teams.
2. Finalize ClickHouse sizing and hosting decision.
3. Spike dual-write ingestion with feature flags to validate assumptions.
