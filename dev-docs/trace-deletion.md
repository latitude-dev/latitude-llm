# Trace deletion

Hard deletion of traces and everything derived from them, so customers can honour data-processing agreements (for example, erasing one of their end-clients' data within 30 days of off-boarding) while keeping the rest of their telemetry. Plan retention is not a substitute: the ClickHouse TTL is `retention_days + 30` (see [`billing.md`](./billing.md) and [`spans.md`](./spans.md)), so even the shortest plan keeps rows for up to 60 days.

Sibling docs: [`spans.md`](./spans.md) (telemetry storage and rollups), [`filters.md`](./filters.md) (the selector language), [`scores.md`](./scores.md), [`conversation-intelligence.md`](./conversation-intelligence.md). Spec and task list: [`specs/trace-deletion.md`](../specs/trace-deletion.md).

## Deletion requests

A deletion is a **trace deletion request**: a Postgres row scoped to one organization and project that is also the customer's receipt. It records the selector, who asked (user or API key), status (`pending → running → completed | failed`), the number of matched traces, rows removed per store, and timestamps. The purge never deletes its own request row.

**Selector.** `{ filters?: FilterSet, traceIds?: TraceId[] }`, at least one non-empty. `filters` is the same `FilterSet` the trace list uses (`tags`, `userId`, `sessionId`, `metadata.*`, …), so "delete what I am looking at" is exact. Trace ids are resolved by paging `TraceRepository.listByProjectId` (the trace list's own read path, as `addTracesToDataset` does) and **snapshotted when the request starts**: a filter never sweeps traces ingested after the request began.

**Execution.** Creating a request emits `TraceDeletionRequested`; its consumer only starts the `trace-deletion:${requestId}` Temporal workflow, which processes the snapshot in batches. Every step is idempotent, because deleting already-deleted rows matches nothing, so retries and replays are safe.

## Purge order

`TracePurgeRepository` (`@domain/spans`, ClickHouse adapter in `@platform/db-clickhouse`) runs three ordered steps per batch:

1. **`listSessionIdsByTraceIds`**, while the spans still exist. A trace's *effective session id* is its span `session_id`, or the trace id when it has none. That is the key `sessions_mv` groups by (`coalesce(nullIf(session_id, ''), toString(trace_id))`), and the key session-scoped derived tables use.
2. **`purgeTraces`** deletes every trace-keyed row.
3. **`purgeSessions`** deletes the session rollups and all session-scoped derived data of the affected sessions, then rebuilds the rollup of every session that still has spans.

Session-scoped derived data (analyses, semantic moments, taxonomy observations, flagger decisions, session-level scores) summarizes the whole session, including the deleted traces, so it is dropped entirely rather than edited. The normal conversation-intelligence pipeline recomputes it for whatever survives. A sessionless trace's effective session contains only that trace, so it never needs a rebuild.

**Rebuild without drift.** `sessions` is an `AggregatingMergeTree` fed by `sessions_mv`. The rebuild reads the live view definition (`system.tables.as_select` plus the view's column order), scopes it with a `WHERE` on organization, project and `session_id` before its `GROUP BY`, and runs `INSERT INTO sessions (…) SELECT …`. It therefore re-aggregates exactly as ingest does, whatever the view becomes. If the view ever loses its single `FROM spans AS s GROUP BY` shape, the rebuild throws rather than producing wrong totals. `traces` needs no rebuild, because a purged trace loses all of its spans.

**Race.** Spans for an affected session that land between its rollup delete and its rebuild are counted twice in that session's rollup. Deletions target off-boarded end-clients that are no longer sending, so this is accepted. Late spans for a *purged* trace id are dropped at ingest by a short-lived tombstone (`org:${organizationId}:trace-tombstone:*`) so they cannot recreate it.

## Store inventory

| Store | Keyed by | Handling |
| --- | --- | --- |
| `spans`, `traces` | trace id | deleted |
| `trace_search_documents`, `trace_search_embeddings`, `trace_message_occurrences` | trace id | deleted |
| `scores` (ClickHouse) and `scores` (Postgres) | trace id; session-level scores (`trace_id = ''`) by session | deleted |
| `memory_events`, `memory_current` | trace id | deleted |
| `sessions` | effective session id | deleted, then rebuilt from surviving spans |
| `session_analyses`, `session_semantic_moments`, `session_moment_labels` | session id | deleted |
| `taxonomy_observations`, `taxonomy_facet_projections`, `taxonomy_view_assignments` | session id | deleted |
| `flagger_screening_decisions`, `flagger_jev_shadow_observations`, `flagger_jev_preclassifier_observations` | session id | deleted |
| `annotation_queue_items` (Postgres) | trace id | deleted |
| `dataset_rows` | `source_trace_id` provenance | tombstoned when the request includes dataset rows; rows created before provenance existed cannot be matched |
| `message_embeddings`, `memory_blobs` | content hash, no trace identity | swept once no surviving occurrence references the hash |
| `scores_hourly_buckets` | signal and hour | kept: content-free counters |
| `billing_usage_events.trace_id` (Postgres) | trace id | kept: billing ledger, no content |
| object storage `tmp-ingest/` | ingest payload | not touched: expires after 1 day |

## ClickHouse mechanics

Deletes are parameterized lightweight `DELETE FROM … WHERE organization_id = … AND project_id = … AND <key> IN {…:Array(String)}`. Rows are masked from every read as soon as the statement returns, and physically removed when their parts next merge. `trace_message_occurrences` carries a projection, so it sets `lightweight_mutation_projection_mode = 'rebuild'` (without it, lightweight deletes on that table throw). Each target is counted before it is deleted, which gives the per-store numbers on the receipt.
