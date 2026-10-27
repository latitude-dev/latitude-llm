# Trace deletion

Hard deletion of traces and everything derived from them, so customers can honour data-processing agreements (for example, erasing one of their end-clients' data within 30 days of off-boarding) while keeping the rest of their telemetry. Plan retention is not a substitute: the ClickHouse TTL is `retention_days + 30` (see [`billing.md`](./billing.md) and [`spans.md`](./spans.md)), so even the shortest plan keeps rows for up to 60 days.

Sibling docs: [`spans.md`](./spans.md) (telemetry storage and rollups), [`filters.md`](./filters.md) (the selector language), [`scores.md`](./scores.md), [`conversation-intelligence.md`](./conversation-intelligence.md). Spec and task list: [`specs/trace-deletion.md`](../specs/trace-deletion.md).

## Deletion requests

A deletion is a **trace deletion request** (`trace_deletion_requests`, `@domain/spans`): a Postgres row scoped to one organization and project that is also the customer's receipt. It records the selector, who asked (`{ type: "user" | "api_key" | "staff", id }`), status (`pending → running → completed | failed`), the number of matched traces, rows removed per store (keyed `clickhouse.<table>` / `postgres.<table>`), the failure reason, and timestamps. The purge never deletes its own request row.

**Selector.** One `FilterSet`, the same language the trace list uses (`tags`, `userId`, `sessionId`, `metadata.*`, …), so "delete what I am looking at" is exact. Explicit trace ids are sugar for a `traceId in [...]` condition, which is why one request can name at most 100 of them (the `in` list cap); larger erasures select by tag, user or metadata. A selector must contain at least one condition, and `gtePercentile` is rejected because a threshold relative to the data is not a stable thing to erase. The dry run (`countTraceDeletionMatchesUseCase`) counts through `TraceRepository.countByProjectId` with the same resolution.

**Cutoff.** Every read of a request's selector adds `startTime <= createdAt`, so a filter never sweeps traces that started after the request was made, however long the purge takes.

**Execution.** Creating a request writes `TraceDeletionRequestCreated` through the outbox. The domain-events router publishes `trace-deletions:run`, whose worker only starts the `trace-deletion:${requestId}` Temporal workflow (`deleteTracesWorkflow`). The workflow drains the selector rather than holding a list of ids: each batch prepares the first page (500 traces) of what still matches and purges it, and the next batch lists again. It finishes when a page comes back empty, and continues-as-new every 40 batches with its running totals so history stays bounded. A batch that lists a trace the previous batch purged means the deletes did not take, so the workflow fails instead of looping. Any failure marks the request `failed` with what was purged so far. Finishing writes `TraceDeletionRequestFinished`; a replay of a finished request does nothing.

## Surfaces

- **Public API** (`@repo/operations`, `traceDeletionsModule` at `/v1/projects/:projectSlug/trace-deletions`). `createTraceDeletion` is `destructive` on the `ultra` rate tier and returns `202` with the pending request. `previewTraceDeletion` is the dry run. `listTraceDeletions` and `getTraceDeletion` read the receipts. The selector is the shared `TracesRef` (`{ by: "ids" }` or `{ by: "filters" }`). API-key requests record `{ type: "api_key", id: <key id> }` and OAuth requests record `{ type: "user" }`. The response reports one `deletedRecordCount` rather than the per-store breakdown, so table names never reach the public contract. The same operations surface as the `traceDeletions` SDK group, the `latitude trace-deletions` CLI commands and MCP tools.
- **Backoffice** (`apps/web/src/domains/admin/trace-deletions.functions.ts`, the project page's "Delete traces" action and "Trace deletions" section). Staff fill tag, user, session, metadata or trace-id fields, which become the equivalent trace-list filters. They preview the count and confirm with the typed phrase `delete traces`. The organization comes from the project row and never from the client. The request is written through the ordinary org-scoped client as `{ type: "staff", id: <admin user id> }`, and staff see the per-store breakdown of each receipt.
- **Product** (`apps/web/src/domains/trace-deletions/trace-deletions.functions.ts`). The trace list's bulk actions include Delete for organization owners and admins, enforced on the server with `MembershipRepository.isAdmin`. Picked rows become explicit trace ids. A select-all becomes the list's filters, with unselected rows added as `traceId notIn`. A select-all over a text search is refused, because filters can't reproduce a search. The modal previews the count and asks for the typed phrase. **Settings → Data deletion** lists every deletion of the project with its receipt id and totals, and the requesting member gets a `trace-deletion.finished` notification when it completes or fails.
- **Customer docs**: `docs/security/trace-deletion.mdx`.

## Purge order

Each batch is three activities, ordered so that a retry after a part-way failure always finishes the job and never changes the receipt:

1. **`prepareTraceDeletionBatchUseCase`** only reads:
   - It lists the page and resolves its session keys with `TracePurgeRepository.listSessionIdsByTraceIds`. These are the span and trace `session_id`s plus the trace ids themselves, because `sessions_mv` keys sessionless spans by trace id (`coalesce(nullIf(session_id, ''), toString(trace_id))`). It reads `traces` as well as `spans`, so it still resolves after a retry whose spans are already gone.
   - It counts the rows every store holds for the batch.

   Its result is recorded once in workflow history. That is what makes the receipt stable: counting inside the deletes would undercount any rows a failed attempt had already removed.
2. **`purgeTraceDeletionBatchUseCase`** deletes:
   - Postgres first, in one transaction with the `TracesPurged` outbox event.
   - Then every trace-keyed ClickHouse table, with `traces` last. `traces` is what the listing reads, so until the batch has fully succeeded its traces keep listing.
3. **`purgeTraceDeletionSessionsUseCase`** takes the session keys prepared in step 1, because by now the traces no longer list. It deletes the session rollups and all session-scoped derived data, then rebuilds the rollup of every session that still has spans. Spans are matched by the same effective key `sessions_mv` groups on, so a surviving sessionless trace that shares a rollup key with a purged session is rebuilt too.

Session-scoped derived data (analyses, semantic moments, taxonomy observations, flagger decisions, session-level scores) summarizes the whole session, including the deleted traces, so it is dropped entirely rather than edited. The normal conversation-intelligence pipeline recomputes it for whatever survives. A sessionless trace's effective session contains only that trace, so it never needs a rebuild.

**Signals.** `TracesPurged` carries the deleted scores. For each published score linked to a signal, the router publishes `issues:removeScore`, the same path annotation deletion uses, so the signal's centroid no longer carries the deleted feedback.

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

Deletes are parameterized lightweight `DELETE FROM … WHERE organization_id = … AND project_id = … AND <key> IN {…:Array(String)}`. Rows are masked from every read as soon as the statement returns, and physically removed when their parts next merge. `trace_message_occurrences` carries a projection, so it sets `lightweight_mutation_projection_mode = 'rebuild'` (without it, lightweight deletes on that table throw). Counting and deleting are separate repository methods (`countTraceRows` / `purgeTraces`, `countSessionRows` / `purgeSessions`, `count` / `purge` on the Postgres side); every delete is idempotent.
