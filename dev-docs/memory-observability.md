# Memory observability

Memory observability gives teams whose agents use persistent, scoped memory a git-like view of how that memory evolves: what each session read, what it changed, the current state of any store as a browsable filetree, and per-record change history back to the exact span that wrote each version.

The one-line model: **every memory-mutating span is a commit**; snapshots, diffs, and blame are derived the way git does — by storing content-addressed states, not diffs.

See also: [`spans.md`](./spans.md) (ingest and OTLP memory-operation classification), [`users.md`](./users.md) (end-user identity and the user-page memory section), [`projects.md`](./projects.md) (project-scoped tenancy). Customer-facing instrumentation docs live under `docs/telemetry/memory.mdx` and `docs/observability/memory.mdx`.

## Wire format

Memory operations arrive as standard OTLP spans with `gen_ai.operation.name` set to one of:

| Operation | Mutates state? |
| --- | --- |
| `create_memory`, `update_memory`, `upsert_memory` | yes |
| `delete_memory` (absent `record.id` ⇒ whole-store wipe) | yes |
| `search_memory` | no (read) |
| `create_memory_store`, `delete_memory_store` | store lifecycle |

The authoritative attribute definitions are in the OpenTelemetry GenAI semantic-conventions repository (`model/gen-ai/`). Latitude classifies these spans at ingest and exposes them on the Spans tab.

### Store identity

`gen_ai.memory.store.id` is the sole identity key. There is no separate scope axis — per-user isolation is a store-naming convention (`user-123/preferences`), not a separate field. A store shared by two users is one manifest (last-writer-wins across users). An absent `store.id` lands in the `""` unattributed bucket.

Record bodies and search query text are opt-in in the SDK helper (`captureContent`); without content, diffs and token deltas degrade to counts.

## Data model

Three ClickHouse tables under the standard org/project tenancy:

| Table | Role |
| --- | --- |
| `memory_events` | Append-only ledger of every read/write/store-lifecycle event (`MergeTree`, partitioned by month) |
| `memory_blobs` | Content-addressed record bodies keyed by `sha256` (`ReplacingMergeTree`) |
| `memory_current` | Hot projection of each `(store_id, record_id)`'s latest version (`ReplacingMergeTree`) |

`memory_events` carries `session_id` stamped from the trace's canonical session at projection time (memory spans often carry no session attribute themselves). Retried projections can append duplicate rows; all reads dedup by `(span_id, store_id, record_id)`.

Domain package: `@domain/memories` (`packages/domain/memories`). Port: `MemoryRepository` (ledger reads/writes, snapshot reconstruction) and `MemoryAnalyticsRepository` (window-scoped insight queries).

## Materialization

At trace-end, after the debounce window elapses, `trace-end:run` fans out a `memory-projection` job per trace. `materializeTraceMemoryUseCase`:

1. Loads memory-operation spans for the trace via `SpanRepository.listMemoryOperationSpansByTraceId`
2. For each mutated record: content-hash the body (`sha256` + `o200k_base` token count), write a blob (deduped), a ledger event, and a `memory_current` row
3. For `search_memory`: one read event per returned record (keyed on the record's `id`)
4. For whole-store wipes: tombstone every live record in `memory_current` for that store

Idempotency rides the trace-end 90s debounce plus `dedupeKey: org:{orgId}:memory-projection:{projectId}:{traceId}`.

## Reconstruction and diff

- `reconstructSnapshotUseCase` — current state from `memory_current`, or point-in-time from the ledger via `argMax`
- `computeMemoryDiff` — hash-prune + line diff + token deltas between two manifests
- `computeSessionMemorySummary` — per-session read/write summary (`read X · write +N −N`), with churn collapse (a record changed twice counts once net)
- `computeRecordHistory` / `computeRecordChangeDiff` — per-record version chain and unified diffs for the record detail page

## Product surfaces

### Spans tab

Memory-operation spans render with operation-specific labels. Record ids with `/` separators become a filetree on the store detail page.

### Session and trace summary

`MemorySummary` in the session drawer and trace header shows read/added/removed token pills with a per-record breakdown grouped by store. Click-through to the store detail page is wired for store rows.

### Memory page (`/projects/:slug/memory`)

**Store list** — one row per store with live record/token counts, window-scoped writes/reads/searches, dead-token %, zero-hit %, read:write ratio, session/user counts, 30-day write-activity sparkline, and server-side sort/pagination via `listStoresWithMetricsUseCase`.

**Store detail** (`/memory/$store`) — filetree sidebar, read-only content pane (JSON-detected), store accessor list, and a Home dashboard with:

- overview tiles (records, tokens, read:write, searches, zero-hit rate)
- activity histogram (creations/updates/deletions/retrievals over time)
- insight panels: most-read records, cold storage candidates (idle ≥ 7 days), top queries, zero-hit queries, size distribution, write-health table (no-op rewrites, reverted content), token footprint history

**Record detail** — Changes / Reads / Users activity panel; per-change unified diff via `CodeDiff` (`?change={spanId}` deep link).

**User page** — "Memory stores accessed" section linking to each store the user touched.

### URL encoding

The `""` store and unnamed records use a `~` sentinel in URL segments (`store-encoding.ts`) so empty strings are addressable.

## Analytics scope

All analytics reads take a `MemoryAnalyticsScope`: `{ organizationId, projectId, from, to }`.

- `live*` counts (`liveRecords`, `liveTokens`, `deadRecords`, `deadTokens`) come from `memory_current` and ignore the time window
- event counts (writes, reads, searches, zero-hit searches) are window-scoped over `memory_events`
- store-list trend sparklines always use one-day buckets, capped to the most recent 30, via `resolveMemoryTrendWindow`

`getStoreInsightsUseCase` powers the per-store Home dashboard: retrieval rankings, cold-record candidates, query frequency, write-health signals, size distribution, and cumulative token footprint history.

## Out of scope (current)

- Per-line blame gutter (deferred; activity panel covers change history)
- Session-scoped time-travel diff route (`/memory/$store?session=…`)
- Provider adapters (Mem0/Supermemory/Zep webhook ingestion)
- Automated pollution detection (`memory-pollution` flagger)
- PII/consent gating on stored memory content
- Billing change (memory operations ride existing span metering)

## File index

| Where | What |
| --- | --- |
| `packages/domain/memories` | Entities, ports, use-cases (`materialize-trace-memory`, `reconstruct-snapshot`, `compute-memory-diff`, `compute-session-memory-summary`, `list-stores-with-metrics`, `get-store-insights`, …), `/testing` fakes |
| `packages/platform/db-clickhouse/src/repositories/memory-repository.ts` | ClickHouse adapter |
| `apps/workers/src/workers/memory-projection.ts` | Projection worker |
| `apps/workers/src/workers/trace-end.ts` | Fans out `memory-projection` jobs |
| `apps/web/src/domains/memories/` | Server fns, TanStack collections, Memory page routes |
| `packages/telemetry/typescript/src/sdk/memory.ts` | `createMemoryTelemetry` SDK helper |
