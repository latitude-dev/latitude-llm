# Memory observability

Memory observability gives teams a git-like view of agent persistent memory: current store contents, per-record version history, diffs between versions, and trace/session attribution for every read and write. Customer-facing docs: `docs/observability/memory.mdx`. Product spec (being retired): `specs/memory-observability.md`.

Domain code: `packages/domain/memories`. ClickHouse adapter: `packages/platform/db-clickhouse/src/repositories/memory-repository.ts`. Materialization worker: `apps/workers/src/workers/memory-projection.ts` (`memory-projection` queue). Web UI: `apps/web/src/routes/_authenticated/projects/$projectSlug/memory/*`, gated by the `memoryObservability` feature flag.

## Wire format

Memory operations are standard OpenTelemetry GenAI spans — no separate ingest API. The seven operations (`create_memory`, `update_memory`, `upsert_memory`, `delete_memory`, `search_memory`, `create_memory_store`, `delete_memory_store`) are classified in `@domain/spans` (`MEMORY_OPERATIONS` / `isMemoryOperation`). OTLP structured attributes (e.g. `gen_ai.memory.records`) are flattened to JSON strings in `attr_string` during `transformOtlpToSpans`.

| Attribute | Role |
| --- | --- |
| `gen_ai.operation.name` | Required discriminator; span name SHOULD match |
| `gen_ai.memory.store.id` | Store identity — the Memory page groups on this. Missing ⇒ `""` unattributed bucket |
| `gen_ai.memory.record.id` | Record touched on mutations |
| `gen_ai.memory.record.count` | Records affected or returned |
| `gen_ai.memory.query.text` | Search query (reads) |
| `gen_ai.memory.records` | Opt-in JSON array of `{ id, content, score?, metadata? }` — powers content, diffs, token counts |

There is no before/after on the wire. Each mutating span carries the record's **full new body**; versions order by span `end_time`; last-to-finish wins as current.

Per-user isolation is a **store naming convention** (`user/${userId}`), not a separate axis. `user_id` on the ledger is an access annotation for "who touched this store," never a partitioning key.

## Architecture

```
OTLP ingest → spans (ClickHouse)
  → TracesIngested → trace-end debounce (90s)
      → memory-projection:run { org, project, traceId, sessionId }
          → materializeTraceMemoryUseCase
              → memory_blobs (content-addressed bodies)
              → memory_events (append-only ledger)
              → memory_current (hot projection)

Read side (@domain/memories, on demand):
  reconstructSnapshot / computeMemoryDiff / computeRecordChangeDiff
  computeSessionMemorySummary / computeSessionMemoryDiff
  listMemoryStores / listRecordHistory
```

Materialization runs at **trace-end**, not inline during ingest — the settled trace is the boundary where final bodies and stable end-time ordering are known. The worker is isolated from ingestion failures (same pattern as deterministic flaggers).

The trace's canonical `sessionId` is stamped on every ledger row even when a memory span carries no session attribute.

## Data model (ClickHouse)

All tables are org/project scoped. Create migrations with `pnpm --filter @platform/db-clickhouse ch:create` — never by hand.

### `memory_blobs`

Content-addressed bodies: `content_hash = sha256(body)`. Identical content dedupes to one row.

### `memory_events`

One row per memory-operation span (reads and writes). Source of truth for history, blame, and store-level session/user rollups.

### `memory_current`

Latest mutating version per `(store_id, record_id)`. `remove` rows tombstone records. Whole-store wipes (`delete_memory_store`, or `delete_memory` without `record.id`) tombstone every live record in the store so later upserts classify as `add`, not `update`.

## Domain use cases

| Use case | Purpose |
| --- | --- |
| `materializeTraceMemoryUseCase` | Trace-end writer: spans → blobs + events + current |
| `reconstructSnapshotUseCase` | Store manifest at a point in time (`memory_current` for "now", ledger `argMax` for historical) |
| `computeMemoryDiffUseCase` | Hash-pruned store diff between two timestamps |
| `computeRecordChangeDiffUseCase` | Unified diff for one version vs its predecessor (Memory page change view) |
| `computeRecordHistoryUseCase` | Ordered write history for a record |
| `computeSessionMemorySummaryUseCase` | Trace/session drawer: tokens read, added, removed per record |
| `computeSessionMemoryDiffUseCase` | Session-level net body change per record |
| `listMemoryStoresUseCase` | Memory page store list with rollups |

Diffs compare content hashes first; only changed records run a line diff (`jsdiff`). Token counts use the shared tiktoken helper in `entities/tokenizer.ts`.

## Product surfaces

| Surface | Data source |
| --- | --- |
| Memory page (stores → filetree → content → activity) | `memory_current` + `memory_events` |
| Record change diff | `computeRecordChangeDiffUseCase` |
| Trace/session Memory row | `computeSessionMemorySummaryUseCase` |
| Spans tab memory filter + detail | Raw `spans` with memory operation classification |
| User page Memory stores | Store list filtered by ledger `user_id` access |

Record ids may contain `/` for nested folder display within a store.

## Feature flag

`memoryObservability` gates the Memory nav entry, user-page memory section, and related server functions. Spans and ledger materialization run regardless — the flag only controls product UI exposure.

## SDK helpers

TypeScript (`@latitude-data/telemetry`): `createMemoryTelemetry()` emits the GenAI memory spans with correct attributes; content capture is opt-in. Python (`latitude_telemetry`): `create_memory_telemetry()`. See `dev-docs/telemetry-sdk.md` and `packages/telemetry/typescript/src/sdk/memory.ts`.

## Non-goals

- No provider adapters (Mem0, Zep, etc.) — ledger `source` column reserves future writes.
- No rollback execution — Latitude never mutates customer memory stores.
- No automated pollution detection — a future `memory-pollution` flagger would read this ledger.
- No billing change — memory spans ride existing trace metering.
