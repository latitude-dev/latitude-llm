# Memory Observability

> **Documentation** — durable homes after stabilization: a new `dev-docs/memory-observability.md`. Related current docs: `dev-docs/spans.md` (span ingestion/storage/query, which this extends), `dev-docs/scores.md` + `specs/signals.md` (the flagger/signal spine a future memory-pollution detector plugs into), `dev-docs/users.md` (end-user identity — the ledger's store-access annotation and the user-page memory section), `dev-docs/projects.md` (project-scoped tenancy).
>
> **Linear**: [LAT-729](https://linear.app/latitude/issue/LAT-729) — "Explore: Memory observability (memory diff / evolution tracking)".

## Contents

1. [Purpose](#purpose)
2. [Scope and non-goals](#scope-and-non-goals)
3. [Ground truth: the OTEL memory conventions](#ground-truth-the-otel-memory-conventions)
4. [The git model we borrow](#the-git-model-we-borrow)
5. [Architecture](#architecture)
6. [Store identity](#store-identity)
7. [Data model](#data-model)
8. [Reconstruction, diff, and blame](#reconstruction-diff-and-blame)
9. [Feature 1 — memory spans on the Spans tab](#feature-1--memory-spans-on-the-spans-tab)
10. [Feature 2 — session / trace memory summary](#feature-2--session--trace-memory-summary)
11. [Feature 3 — the Memory page](#feature-3--the-memory-page)
12. [Feature 4 — commit-style session diff view](#feature-4--commit-style-session-diff-view)
13. [Metering, retention, tenancy, self-hosting](#metering-retention-tenancy-self-hosting)
14. [Decisions](#decisions)
15. [Tasks](#tasks)

---

## Purpose

Give teams whose agents use persistent, scoped memory a **git-like view of how that memory evolves** — what each session read, what it changed (`read 412k · write +612 −24`), the current state of any scope as a browsable filetree, and per-line provenance back to the exact span that last wrote each line. This is the observability layer nobody ships today: providers (Mem0, Supermemory, Zep) version memory inside their own store, but no observability platform ties a memory change to the **trace that caused it** and to the **evaluations that graded that trace**. That correlation is the differentiated bet.

The one-line model: **we treat every memory-mutating span as a commit, and derive snapshots, diffs, and blame the way git does — by storing content-addressed states, not diffs.**

---

## Scope and non-goals

**In scope**

- Ingesting the OpenTelemetry GenAI **memory-operation** spans (`create_memory`, `update_memory`, `upsert_memory`, `delete_memory`, `search_memory`, `create_memory_store`, `delete_memory_store`) through the existing OTLP pipeline, classifying them, and rendering them on the Spans tab.
- A content-addressed **memory ledger** (`memory_events` + `memory_blobs`) plus a hot current-state projection (`memory_current`) in ClickHouse.
- A `@domain/memories` package that reconstructs a store's state at any point in time, diffs two points, and computes per-line blame.
- Four product surfaces: memory spans on the Spans tab; a per-session/trace read/write summary; a Memory page (store list → filetree + content + blame + who accessed it); and a commit-style session diff view.

**Non-goals (this spec)**

- **No PII/consent gating.** Decision [D1](#decisions): we store memory content as sent and do not gate on opt-in in v1. This must be revisited before any GA/marketing.
- **No provider adapters.** Mem0/Supermemory/Zep webhook or polling ingestion is out of scope; the ledger reserves a `source` column so an adapter can write the same tables later without a schema change. Decision [D10](#decisions).
- **No rollback execution.** Latitude never mutates a customer's memory store. A "flag polluted trace → compute affected changes → present inverse operations" report is a later phase, not this spec.
- **No automated pollution detection.** A `memory-pollution` flagger (sibling of the existing `forgetting` strategy) is future work; this spec builds the substrate it would read.
- **No billing change.** Memory operations arrive as spans and ride existing span metering. Decision [D11](#decisions).

---

## Ground truth: the OTEL memory conventions

### Where the conventions live (as of mid-2026)

The GenAI semantic conventions were **split out of the `open-telemetry/semantic-conventions` monorepo into their own repository, [`open-telemetry/semantic-conventions-genai`](https://github.com/open-telemetry/semantic-conventions-genai)** — that repo is now the source of truth for everything `gen_ai.*`, memory included. Two consequences: the memory attributes are newer and thinner than a casual read of the old monorepo docs suggests, and the authoritative definitions are the machine-readable model files, not the rendered docs. Under **`model/gen-ai/`**:

- **`registry.yaml`** — every `gen_ai.*` attribute (id, type, stability, brief). All five `gen_ai.memory.*` attributes are declared here.
- **`spans.yaml`** — the memory operation spans and which attributes apply to each.
- **`gen-ai-memory-records.json`** — a **JSON Schema** for the `gen_ai.memory.records` payload. The attribute's declared `type` is `any`; this companion file is what actually pins the record structure. The same "`any` attribute + companion JSON Schema" pattern is used for the other content-bearing attributes (`gen-ai-input-messages.json`, `gen-ai-output-messages.json`, `gen-ai-tool-call-*.json`, `gen-ai-tool-definitions.json`, `gen-ai-retrieval-documents.json`, `gen-ai-system-instructions.json`).
- The rendered docs (`docs/gen-ai/gen-ai-spans.md` → "Memory"; `docs/registry/attributes/gen-ai.md`) are generated from the model — read the model files when in doubt.

Everything below was verified against those model files. **Everything here is at `Development` stability** — unstable, and shipping instrumentation that emits it is nascent as of mid-2026. We adopt it as the canonical wire format but must tolerate absence and change.

### Operations (`gen_ai.operation.name` values)

Span name SHOULD equal `gen_ai.operation.name`; span kind CLIENT (or INTERNAL for in-process).

| Operation | Meaning | Mutates state? |
| --- | --- | --- |
| `create_memory` | Create new memory records | yes (add) |
| `update_memory` | Modify known existing records | yes (update) |
| `upsert_memory` | Create-or-update without the caller choosing which | yes (add or update) |
| `delete_memory` | Delete records; **absent `record.id` ⇒ delete all records in the store** | yes (remove) |
| `search_memory` | Query/retrieve records | no (read) |
| `create_memory_store` | Create/initialize a store | store lifecycle |
| `delete_memory_store` | Delete/deprovision a store | store lifecycle |

### Attributes (Memory span)

| Attribute | Level | Type | What it gives us |
| --- | --- | --- | --- |
| `gen_ai.operation.name` | **Required** | string | the operation above (our discriminator) |
| `gen_ai.memory.store.id` | Cond. Required | string | store identity, e.g. `user-preferences-store` |
| `gen_ai.memory.record.id` | Cond. Required | string | the record touched, e.g. `mem_5j66…` |
| `gen_ai.memory.record.count` | Recommended | int | # records affected/returned |
| `gen_ai.memory.query.text` | **Opt-In** | string | search query text (PII warning) |
| `gen_ai.memory.records` | **Opt-In** | any | the record **content** payload (PII warning); JSON per `model/gen-ai/gen-ai-memory-records.json` |
| `gen_ai.provider.name` | Cond. Required | string | provider (memory system) |
| `server.address` / `server.port` | Recommended | — | memory server endpoint |
| `error.type` | Cond. Required | string | on error |

**Two facts that shape the whole design:**

1. **There is no `gen_ai.memory.scope` attribute** (contrary to an earlier internal report). `gen_ai.memory.store.id` is the only organizing identity on the wire, so it — not a derived scope — is the key everything groups under; see [Store identity](#store-identity).
2. **There is no before/after on the wire, and no token count.** `gen_ai.memory.records` is the *current* content of the records in that operation (opt-in). A diff and a token count are things **we derive**, not read. `record.count` is the only always-available quantity.

`gen_ai.memory.records` content model (`model/gen-ai/gen-ai-memory-records.json`, verified): an **array** of records where **`content` (`any`) is the only required field**, plus optional `id` (string), `score` (number, populated on search results), and `metadata` (object). The record object also sets **`additionalProperties: true`** — extra keys are tolerated but undefined by the standard. Notably there is **no `moved_from`/rename field and no rename operation**: a rename is not representable from a single span and is a derived (ledger/Phase 1) concern, not a wire fact. Because the attribute is declared `any` and is `development`-stage, emitters may deviate — consumers validate the shape and fall back to the raw payload. We treat, per record, the `content` field (stringified if object) as that record's new full body.

---

## The git model we borrow

git is fast because it **stores snapshots, not diffs**, and makes snapshots cheap with content addressing. We steal exactly four ideas:

1. **Content addressing + dedup.** Hash each record body; store each unique body once (`memory_blobs`). A record written identically twice costs one blob.
2. **A version is a manifest of hashes.** "State of a store at time T" = the set of `(record → content_hash)` current as of T. Unchanged records share a hash, so a full snapshot is a small list, not a copy of every body.
3. **Diffs are computed on demand and pruned by hash equality.** To diff two points, compare their manifests; where a record's hash is equal on both sides it is provably unchanged — skip it. Only line-diff the records whose hash differs. Cost ∝ what changed.
4. **Delta/zlib packing is a storage-layer concern.** We get this from ClickHouse `CODEC(ZSTD)` on the blob column; we do not build git's packfile delta chains.

Where our world is **simpler** than git: a flat namespace of records (no recursive trees — we split `record.id` on `/` only for UX), no merges/branches, small bodies.

Where it is **harder**: memory is multi-tenant append-only telemetry we don't control; a shared store is written concurrently by many sessions (and many users) with no parent pointers. Decision [D2](#decisions) resolves this by the simplest rule that works: **each mutating span carries the full new body of the record it touches, i.e. each span is a full snapshot of that record; versions are ordered by span end-time; last-to-finish wins as current.** No parent-pointer isolation, no three-way merge — just "latest write per record."

---

## Architecture

```
OTLP POST /v1/traces  (apps/ingest/src/routes/traces.ts)
  → ingestSpansWithBillingUseCase → ingestSpansUseCase           [unchanged]
  → queue "span-ingestion":"ingest"
  → processIngestedSpansUseCase (transformOtlpToSpans)           [+ memory resolver]
      · resolveOperation now classifies the 7 memory ops
      · resolveMemory extracts store.id/record.id/count/query/records
  → SpanRepository.insert  → ClickHouse `spans`                  [memory spans queryable on Spans tab]
  → TracesIngested event → debounced (90s) "trace-end":"run"
      → NEW "memory-projection":"run"  (mirrors deterministic-flaggers)
          · read the settled trace's memory spans
          · per mutating record: body → content_hash, tiktoken → token_count
          · write `memory_blobs` (dedup) + `memory_events` (ledger) + `memory_current` (projection)

Read side (@domain/memories, on demand):
  reconstructSnapshot(store, at)   → manifest {record → blob} via argMax over ledger (or memory_current for now)
  computeDiff(store, from, to)     → hash-prune + jsdiff on survivors → {added/updated/removed, +/- tokens}
  computeBlame(store, record, at)  → walk versions newest→oldest, attribute lines → span_id/trace_id
  sessionSummary(session)          → per-record read tokens (search hits by record id) + per-record write diff
```

Materialization runs at the **trace-end boundary** (`apps/workers/src/workers/trace-end.ts`), not inline in ingestion, because that is the settled point where a record's final body within a trace and a stable end-time ordering are known. It is added as its own worker/queue step exactly like the deterministic-flaggers fan-out already is (isolated failure domain).

New/changed code:

- `packages/domain/spans/src/entities/span.ts` — extend `operationSchema` with the 7 memory ops; export `MEMORY_OPERATIONS` / `isMemoryOperation`.
- `packages/domain/spans/src/otlp/transform.ts` — `resolveAnyValue` flattens OTLP `arrayValue`/`kvlistValue` attributes to a JSON string so structured payloads (e.g. `gen_ai.memory.records`) survive in `attr_string`.
- `packages/domain/spans/src/otlp/resolvers/memory.ts` — new resolver (candidate lists for store/record/count/query/records), wired into `resolvers/index.ts` and `transform.ts`. *(Phase 1 — Phase 0 reads the raw attributes instead.)*
- `packages/domain/memories/*` — new domain package (entities, ports, use-cases; see [Data model](#data-model)).
- `packages/platform/db-clickhouse/src/repositories/memory-repository.ts` — CH adapter + migrations (`memory_events`, `memory_blobs`, `memory_current`), created via `pnpm --filter @platform/db-clickhouse ch:create`.
- `apps/workers/src/workers/memory-projection.ts` — trace-end-triggered materializer.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/memory/*` + a nav entry in `apps/web/src/layouts/AppSidebar/index.tsx`; memory-span detail section under `-components/trace-detail-drawer/tabs/spans-tab/span-detail/`.

---

## Store identity

The **store** (`gen_ai.memory.store.id`) is the unit the Memory page lists and everything groups under. It is a real OTEL wire field, so there is nothing to resolve or derive — the store id on the span is the store id. Record identity is `(store_id, record_id)` ([D3](#decisions)); a record's version chain, its diff, and its blame are all read per store.

A span with no `store.id` (only Conditionally Required in OTEL) lands in the `""` store — the explicit "unattributed" bucket, its own store, never dropped.

**Per-user memory is a store-naming convention, not a separate axis.** A customer who wants isolated per-user memory sets `store.id` to the user id (or a `user/…` prefix) at the emitter, so those become naturally distinct stores; a store shared by several users is one manifest, last-writer-wins across all of them ([D2](#decisions)). The `user_id` resolved per span (`user.id` / `identity.ts` candidates) is kept on the ledger as a pure **access annotation** — "which users touched this store" — never as an identity or partitioning key. That is what powers the store's user list and the per-user "stores accessed" view.

The Memory-page tree splits `record_id` on `/` for nesting within a store; `record_id` absent ⇒ a single unnamed record.

> **Requirement to document for customers**: memory attributes to a store only if the span carries `gen_ai.memory.store.id`; spans without it land in the `""` store. For per-user isolation, set `store.id` per user.

---

## Data model

Three ClickHouse tables (append-only migration rules apply; create with `ch:create`, never by hand) plus a Zod-first domain package. All tables are `organization_id`/`project_id` scoped.

### `memory_events` — the ledger (source of truth)

One row per memory-operation span (mutations **and** reads). `MergeTree`.

| Column | Type | Notes |
| --- | --- | --- |
| `organization_id`, `project_id` | String | tenancy |
| `store_id` | String | `gen_ai.memory.store.id` (`''` if absent) — the organizing key |
| `record_id` | String | `gen_ai.memory.record.id` (`''` for store-lifecycle / whole-store deletes) |
| `operation` | LowCardinality(String) | one of the 7 ops |
| `change_kind` | LowCardinality(String) | derived: `add` / `update` / `remove` / `read` / `store_create` / `store_delete` (see below) |
| `content_hash` | String | sha256 hex of the record body; `''` when no content was sent |
| `token_count` | UInt32 | tiktoken over the body (0 when no content) |
| `record_count` | UInt32 | `gen_ai.memory.record.count` |
| `query_text` | String CODEC(ZSTD(3)) | for `search_memory` |
| `span_id` | FixedString(16) | authoring span (blame target) |
| `trace_id` | FixedString(32) | |
| `session_id` | String | the trace's **canonical** session id, stamped on every event at materialization (join key for session summary) — see note below |
| `user_id` | String | resolved user identity |
| `start_time`, `end_time` | DateTime64(6) | **ordering is by `end_time`** ([D2](#decisions)) |
| `source` | LowCardinality(String) | `'otlp'` today; reserved for provider adapters ([D10](#decisions)) |
| `ingested_at` | DateTime64 | |

`ORDER BY (organization_id, project_id, store_id, record_id, end_time, span_id)`, `PARTITION BY toYYYYMM(end_time)`. `user_id` is stored but unindexed (access-annotation reads scan the partition; add a bloom filter if hot).

`change_kind` derivation at materialization:
- `search_memory` → `read` (one event per returned record, keyed on the record's own `id`; never mutates the manifest).
- `create_memory` → `add`; `update_memory` → `update`.
- `upsert_memory` → `add` if the record had no prior mutating event in the store, else `update`.
- `delete_memory` with `record.id` → `remove`; without `record.id` → a `store_delete`-flavored whole-store wipe (see reconstruction).
- `create_memory_store` / `delete_memory_store` → `store_create` / `store_delete`.

### `memory_blobs` — content-addressed bodies (git's object store)

Dedup of record bodies. `ReplacingMergeTree(created_at)`.

| Column | Type | Notes |
| --- | --- | --- |
| `organization_id` | String | dedup is per-org |
| `content_hash` | String | sha256 hex (primary identity) |
| `content` | String CODEC(ZSTD(3)) | the body, inline; mirrors `spans.input_messages` |
| `content_file_key` | String | object-storage key (`@platform/storage-object`) when body exceeds the inline threshold; `content` empty then |
| `byte_size` | UInt32 | |
| `token_count` | UInt32 | tiktoken, computed once per unique body |
| `created_at` | DateTime64 | |

`ORDER BY (organization_id, content_hash)`. Inline threshold reuses the ingestion convention (`INLINE_PAYLOAD_MAX_BYTES = 50_000`, `ingest-spans.ts:22`); larger bodies go to `StorageDisk` via `putInDisk`. Records are usually small, so inline is the common path.

### `memory_current` — hot current-state projection

Latest mutating version per record, for fast "current snapshot" reads (T = now). `ReplacingMergeTree(end_time)` keyed `(organization_id, project_id, store_id, record_id)`, one row upserted per mutating event, carrying `content_hash`, `change_kind`, `span_id`, `trace_id`, `session_id`, `token_count`, `end_time`. Reads take the latest row per key (`FINAL`/`argMax`) and drop `change_kind = 'remove'`. Deliberately **not** keyed by user — a record has one current body no matter how many users wrote it; "who accessed a store" is a set aggregation over `memory_events.user_id`, never denormalized here. Point-in-time reads (T ≠ now) do **not** use this table — they aggregate the ledger. A whole-store wipe writes a `remove` row here for every live record in the store (a tombstone), so the current view reflects the wipe without depending on the ledger's `store_delete` event. This table carries **no TTL** — it is bounded by live-record count, and the wipe tombstones must outlive the ledger's retention.

### Domain package `packages/domain/memories`

Mirrors `@domain/scores` layout (`package.json` `@domain/memories`, `main`/`types` → `src/index.ts`, `./testing` export; deps `@domain/spans`, `@domain/shared`, `@domain/events`, `effect`, `zod`, plus `diff` and the tokenizer):

- `src/entities/` — `memory-event.ts`, `memory-record.ts`, `memory-snapshot.ts` (`{ storeId, at, records: Manifest }`), `memory-diff.ts` (`{ added, updated, removed, tokensAdded, tokensRemoved, recordsChanged }`), `memory-blame.ts` (`Array<{ line, spanId, traceId, sessionId, at }>`).
- `src/ports/memory-repository.ts` — write side + reconstruction reads (`insertEvents`, `upsertBlobs`, `upsertCurrent`, `readCurrentSnapshot(store)`, `readManifestAt(store, at)`, `readLatestStoreWipes(store, at)`; Phase 1); `readBlobs(hashes)`, `readSessionMemoryEvents(session, trace?)`, `readRecordVersions(records[], at?)` (Phase 2); `listStores`, `listStoreUsers` / `listUserStores`, plus `readRecordReadEvents` + `listRecordUsers` for the record-detail activity panel (Phase 3, shipped in #4083); blame reads still pending (P3-3).
- `src/use-cases/` — `materialize-trace-memory.ts`, `reconstruct-snapshot.ts`, `compute-memory-diff.ts`, `compute-memory-blame.ts`, `compute-session-memory-summary.ts`, `list-memory-stores.ts`.
- `src/testing/` — fake repository (chdb testkit in integration tests).

---

## Reconstruction, diff, and blame

ClickHouse cannot line-diff; it owns storage + manifest reconstruction, and `@domain/memories` owns the text algorithms (`diff` = jsdiff v8, added to the pnpm catalog in Phase 2; tokenizer = `js-tiktoken`).

### Reconstruct a manifest at time T

Ledger aggregation (no event replay):

```sql
SELECT store_id, record_id,
       argMax(content_hash, end_time)  AS content_hash,
       argMax(change_kind, end_time)   AS change_kind,
       argMax(span_id, end_time)       AS span_id,
       argMax(token_count, end_time)   AS token_count
FROM memory_events
WHERE organization_id = {org} AND project_id = {project}
  AND store_id = {store}
  AND change_kind IN ('add','update','remove')
  AND end_time <= {at}
GROUP BY store_id, record_id
HAVING change_kind != 'remove'
```

Whole-store wipes (`delete_memory` without `record.id`, and `delete_memory_store`) are handled two ways. At materialization the wipe writes a `remove` tombstone into `memory_current` for each of the store's live records, so the `T = now` read (which shortcuts to `memory_current`) reflects the wipe directly and durably. The ledger keeps no per-record tombstone, so point-in-time reads (T ≠ now) apply a post-filter: for each `store_id`, drop records whose latest mutation `end_time` is earlier than the store's latest wipe `end_time ≤ {at}`. The post-filter runs on both paths; for `T = now` it is redundant with the tombstones but harmless.

Scaling lever (deferred, [D7](#decisions)): if a store's event count grows large, periodic materialized snapshot checkpoints per store turn point-in-time into "nearest checkpoint + short forward scan" — git's commit-tree tradeoff. Not built in v1.

### Diff between two points

Reconstruct manifest at `from` and at `to`; join on `(store_id, record_id)`:
- present only in `to` → **added**; only in `from` → **removed**; both but `content_hash` differs → **updated**; **equal hash ⇒ skip** (the prune).
- For added/updated/removed, fetch bodies from `memory_blobs` and run `diffLines` (jsdiff). `tokensAdded` = tiktoken over inserted segments, `tokensRemoved` = tiktoken over deleted segments (a whole added record = all its tokens added; a removed record = all removed). `recordsChanged` = counts per bucket.
- Result renders as `+N −N tokens` and `+A ~U −R records`. Fallback to line counts when a body is absent ([D5](#decisions)).

Because diff compares **endpoints only**, intra-window churn collapses for free — a record added then removed in the same window is equal-or-absent at both ends and nets out. This is the "compare initial to final, not sum of edits" requirement.

### Session / trace write diff (the concurrency rule)

Per [D2](#decisions), a session's write contribution is computed **per record it touched**, endpoint-to-endpoint, over that record's own version chain:

For each `(store_id, record_id)` the session mutated: `before` = the body current just before the session's first mutating event on that record; `after` = the body at the session's last mutating event on that record. Diff `before → after`. Sum across records. When no other session interleaved that record, this equals the clean two-point diff; when interleaving happened, "last-to-finish wins" ([D2](#decisions)) defines `before`/`after` unambiguously by end-time, and the UI is honest that concurrent writers share a store. Trace-level summary is the same restricted to one `trace_id`.

### Blame

Per record at T: load its mutating versions ordered by `end_time` (each carries full body + `span_id`/`trace_id`/`session_id`). Walk newest→oldest, diffing consecutive versions with jsdiff; a line unchanged from the older version is attributed downward, a line introduced by the newer version is attributed to it. Terminate when every current line is assigned. Output maps each current line → the last span that wrote it, linking to that trace. On demand (files are small); materialize only if a view proves hot.

---

## Feature 1 — memory spans on the Spans tab

**Goal:** the 7 memory operations are first-class spans: classified, colored, filterable, with a detail panel.

- **Classification:** add the ops to `operationSchema` (`span.ts`). `resolveOperation` already reads `gen_ai.operation.name`, so they classify with no extra mapping; the enum entry unlocks first-class icon/color and filtering. `resolvers/memory.ts` extracts `store.id`, `record.id`, `record.count`, `query.text`, and `records` into resolved fields (and, passively, dot-flattened attrs already land in `attr_string`/metadata).
- **Rendering (shipped):** `memory-operation-section.tsx` under `span-detail/` renders one **Memory** section — `query.text` for reads, then the records. When the payload matches the record schema it renders as a **master-detail** (a records rail + a content pane that fills edge-to-edge and scrolls internally; header `[db] <store id> (N)`; `search_memory` results sort by `score`); off-schema/absent payloads fall back to the raw JSON or "Content not captured". Store + count ride the records header; identity fields (`store.id`/`record.id`/`record.count`) drop to a summary row only when there's no records table. An icon in `span-tree/span-icon.tsx`, a color in the operation color map (the operation-coloring introduced by #4023), and a filter entry in `span-filters.ts`. Built on a reusable `MasterDetail` (`@repo/ui`) + a `fillHeight` mode on `CodeBlock`. The "View in Memory →" link to the store page is deferred until Feature 3/4 exist.
- **No storage dependency** — ships independently of the ledger.

**UI copy:** `search_memory` results render under a "Results" subsection; the other operations render their records under "Records". Per-record change badges (create/update/delete/rename icons) were explored and **dropped**: a span's `operation` is uniform across all records it carries, so a meaningful per-record change kind (and rename detection) is a Phase 1 / Memory-page concern, not something derivable in the span detail.

---

## Feature 2 — session / trace memory summary

**Goal:** a per-record memory footprint on the session and trace detail views: read / added / removed token pills, hover-expanding to a per-record breakdown grouped by store.

- **Read** = per record, Σ `token_count` of that record's `search_memory` read events ([D5](#decisions)). The materializer emits **one read event per returned record, keyed on the record's `id`** in `gen_ai.memory.records` (the scalar `gen_ai.memory.record.id` is empty on search) — so reads attribute to the record they came from and merge with that record's writes. Hits with no `id` bucket together under `''`.
- **Write** = the per-record endpoint diff from [Reconstruction § session write diff](#session--trace-write-diff-the-concurrency-rule): `+N −N tokens`, churn collapsed. Fallback to record-level `tokenCount` when a body is absent.
- **Shape:** `compute-session-memory-summary` returns per-record `{ storeId, recordId, readTokens, tokensAdded, tokensRemoved }` plus a `total`; a record read *and* written merges into one entry.
- **Placement:** a `Memory` row in the detail body directly under Cost — the trace `TraceTab` and session `MetadataTab`, after `UsageSummary`. Soft `*-muted` pills for read / added / removed tokens (eye / plus / minus icons, the icon carrying the sign so numbers drop the `+`/`−` prefix; `tok` unit); the added/removed pair shows only when there is a token delta. Hover opens a breakdown grouped by store (plain store headers with no value of their own), one row per record with its read / added / removed metrics toned muted / success / destructive (text + icon color only), capped at 10 rows; id-less reads collapse to one `—` row. Renders nothing until the summary loads or when the session touched no memory. **No cache in v1** — the read is cheap (bloom-indexed session scan + one batched blob fetch); Redis + worker invalidation is a deferred lever.
- **Click-through:** each store will link to Feature 4 (`/memory/{store}?session={id}`), wired in Phase 4 (P4-2) once that route exists.

---

## Feature 3 — the Memory page

**Goal:** browse memory as a set of stores, each like a repo, and see who touched them.

- **Nav + routes:** a "Memory" entry in `apps/web/src/domains/projects/project-sections.ts` (group `observe`, alongside Sessions / Users / Tools); routes:
  - `…/projects/$projectSlug/memory/index.tsx` — **store list**: one row per store (`store.id`, or `""` for the unattributed bucket), with record count, total tokens, last-updated, # sessions that wrote it, and the count of distinct users who accessed it. Backed by `list-memory-stores` over `memory_current` plus a `uniqExact(user_id)` roll-up over `memory_events`.
  - `…/projects/$projectSlug/memory/$store/index.tsx` — **store detail** (IDE-style): left filetree (record ids split on `/`) for the latest snapshot; center pane shows the selected record's current body (read-only, JSON-detected); a **Record Activity** panel (a resizable, collapsible VSCode-style bottom panel) with three tabs — **Changes** (write history: create/update/remove with per-version token deltas and the authoring user), **Reads** (retrieval events with the `search_memory` query, tokens returned, and the user), and **Users** (a per-record read/write roll-up linking to each user's page). Rows on Changes and Reads open the originating session in the session drawer. The store header lists the users who accessed the store, each linking to their detail page. The per-line **blame gutter** ([P3-3](#phase-3--the-memory-page-feature-3)) is deferred — the activity panel ships in its place ([D13](#decisions)).
- **The end-user page gets a memory section.** The existing `…/users/$userId/` page gains a "memory stores accessed" section (a sibling of `user-behaviours-section` / `user-issues-section`), each store linking to `…/memory/$store`. `$userId` is the same `ExternalUserId` the ledger stores, so it filters `memory_events.user_id` directly — no id resolution.
- **Feature flag.** The page is gated by `memoryObservability` ([D14](#decisions)): it hides the nav entry and the end-user section, and both routes check the flag (like the `sso` route), render an "unavailable" state when off, and disable their data queries — so a flag-off org cannot load the page or fetch memory data by URL.
- **Store ↔ user access reads** are ledger set aggregations: `SELECT DISTINCT user_id … WHERE store_id = {store}` (users on a store) and `SELECT DISTINCT store_id … WHERE user_id = {user}` (stores for a user); reads (`search_memory`) count as access.
- **Latest snapshot** uses `memory_current` (hot). The `""` store is listed explicitly.
- Deleted records disappear from the tree; a "show deleted" toggle can surface tombstones (nice-to-have, not required for v1).
- **URL:** `$store` is an encoded path segment (store ids are opaque and may contain `/`) and the selected record rides a `?record=` param; both use `~`-prefixed sentinels for the `""` store / unnamed record, with real ids that start with `~` escaped so they never collide with a sentinel.

---

## Feature 4 — commit-style session diff view

**Goal:** from the session's memory summary, land on the store at that session and read it like a GitHub commit.

- **Route:** `…/memory/$store/index.tsx?session={sessionId}` (or `…/memory/$store/sessions/$sessionId`). Header shows the session/trace link and the `+N −N tokens · +A ~U −R records` summary.
- **Time-travel snapshot:** reconstruct the store's manifest **as of the session's end** (`reconstruct-snapshot(store, at=sessionEnd)`), so the tree reflects history, not "now".
- **Changed files marked:** files the session added/updated/removed get badges in the tree; selecting one shows a unified (default) / split diff of `before → after` for that record (the session write diff). Unchanged files are browsable but unmarked.
- This is the surface that realizes LAT-729's "each change references the trace that caused it," at commit granularity.

---

## Metering, retention, tenancy, self-hosting

- **Metering:** memory operations are spans; they are metered by the existing span/trace usage path. No new meter. ([D11](#decisions))
- **Retention:** `memory_events` carries a TTL (`retention_days + 30`). `memory_current` has **no TTL** (bounded by live-record count; its wipe tombstones must outlive the ledger). `memory_blobs` has **no TTL or GC yet** and grows unbounded until a collector drops hashes no retained event references — a pre-GA lever, alongside a **memory-body size cap** (content is uncapped and stored inline today, [D1](#decisions)); these two are the storage levers that matter before high-volume GA, not day-one cost. Point-in-time reconstruction older than blob retention degrades to hashes/ids without bodies.
- **Tenancy:** every table is `organization_id`/`project_id` scoped; `store_id` strings are opaque and org-partitioned; blob dedup is per-org (never cross-tenant).
- **Self-hosting:** no new infrastructure — blobs inline in ClickHouse (ZSTD), with the object-storage fallback using the existing `@platform/storage-object` `StorageDisk` (SeaweedFS by default). New deps `js-tiktoken` (MIT) and `diff`/jsdiff (BSD, added to the catalog in Phase 2) are permissive and satisfy the OSS bundle rule; audit transitive additions when adding them.

---

## Decisions

- **D1 — Content/PII not gated (v1).** Store `gen_ai.memory.records` content as sent; degrade gracefully when absent. Revisit consent/redaction/retention before GA. *(User call.)*
- **D2 — Span = full record snapshot; last-to-finish wins.** Each mutating span carries the full new body of the record it touches; versions order by `end_time`; the latest is current. No parent-pointer isolation, no merge. *(User call.)*
- **D3 — Record identity = `(store_id, record_id)`; `store_id` is the sole organizing key; the Memory-page tree splits `record_id` on `/` within a store.** Records need not be real files. *(User call.)*
- **D4 — Scope is removed; `store_id` organizes everything.** OTEL defines no memory scope, and the original derived-scope chain (`gen_ai.memory.scope` → `latitude.memory.scope` → `user.id` → `""`) fragmented a store shared by multiple users into one manifest per user. It was deleted as a pre-Phase-3 step: record identity is `(store_id, record_id)`, per-user memory is a store-naming convention (`store.id = user id`), and the resolved `user_id` is a ledger **access annotation** only, never a partitioning key. See [Store identity](#store-identity) and the pre-Phase-3 tasks. *(User call, superseding the original scope-resolution decision.)*
- **D5 — Read metric = approx tokens (js-tiktoken), fallback record count. Write metric = `+/− tokens` from the endpoint line diff (fallback lines) + records changed.** Both are attributed **per record** — reads keyed on the search hit's own `gen_ai.memory.records[].id`, id-less hits bucketed under `''`. *(User call.)*
- **D6 — Git-style storage:** content-addressed `memory_blobs` (dedup) + `memory_events` ledger + `memory_current` projection. Store snapshots, derive diffs.
- **D7 — Reconstruction:** current-state via `memory_current`; point-in-time / diff / blame on demand in `@domain/memories`. Per-store snapshot checkpoints deferred until volume demands.
- **D8 — Materialization at the trace-end boundary** via a dedicated `memory-projection` worker (isolated failure domain, mirrors deterministic-flaggers).
- **D9 — Delete semantics:** `delete_memory` with `record.id` = record remove; without `record.id` = whole-store wipe; `delete_memory_store` = whole-store wipe of that store. A whole-store wipe writes a `store_delete` ledger event **and** a per-record `remove` tombstone into `memory_current` for every live record in the store, so the current view survives the ledger's retention TTL and a later `upsert` of a wiped record classifies as `add` (the seed snapshot is wipe-aware); point-in-time reconstruction additionally applies the post-filter by store wipe time.
- **D10 — Provider adapters out of scope**, but `memory_events.source` reserved so Mem0/Supermemory/Zep can write the same tables later.
- **D11 — No billing change**; memory ops ride span metering.
- **D12 — Tenancy:** all tables org+project scoped; blob dedup per-org.
- **D13 — The record detail is an activity panel, not a blame gutter (v1).** The store-detail record pane ships a **Record Activity** panel with **Changes / Reads / Users** tabs (write history + token deltas, retrieval queries, per-record read/write roll-up) and click-through to the session drawer. Per-line blame ([P3-3](#phase-3--the-memory-page-feature-3)) is deferred — the panel covers "who changed this and when" without the version-walk line attribution. *(User call, #4083.)*
- **D14 — `memoryObservability` gates the routes, not just the nav.** Both memory routes check the flag (following the `sso` convention — a component-level `useHasFeatureFlag` fallback, not a `beforeLoad` gate), render an unavailable state when off, and disable their queries. Server functions stay organization-scoped via `resolveOrgScope`; the flag is a rollout gate, and org-scoping (not the flag) is the tenancy boundary. *(#4083, after three reviewers flagged direct-URL reachability.)*
- **D15 — Store-less reads bucket into the `""` (unattributed) store.** A `search_memory` span with no `gen_ai.memory.store.id` attributes its read to `store_id = ''`; since reads never materialize into `memory_current`, that store shows on user pages (reads count as access) but opens with no records. Expected behavior — the fix is emitter-side (set the store id on search spans). *(Observed during #4083 testing; keep as-is.)*

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 0 — Memory spans on the Spans tab (Feature 1) — shipped

Phase 0 reads memory attributes straight from `attr_string`/`attr_int` + the indexed `operation` column; **no ClickHouse migration and no memory resolver** (both move to Phase 1 with the ledger).

- [x] **P0-1**: Add the 7 memory operations to `operationSchema` + export `MEMORY_OPERATIONS` / `isMemoryOperation` (`packages/domain/spans/src/entities/span.ts`).
- [x] **P0-2**: Capture structured attributes — `resolveAnyValue` (`packages/domain/spans/src/otlp/transform.ts`) flattens `arrayValue`/`kvlistValue` to a JSON string so `gen_ai.memory.records` survives in `attr_string`. (Dedicated `resolvers/memory.ts` + resolved fields/columns deferred to Phase 1.)
- [x] **P0-3**: Spans-tab rendering — `span-detail/memory-operation-section.tsx` detail panel (reads attr maps), memory icons (`span-icon.tsx`), waterfall color (`span-tree/helpers.ts`), and a "Memory" filter toggle (`span-filters.ts` / `use-span-filters.ts` / `span-filters-bar.tsx`). Shared `isMemoryOperation` in `spans-tab/memory-operations.ts`. The records payload renders as a schema-validated master-detail (`memory-records.tsx` + `memory-records-parse.ts`) built on a new reusable `MasterDetail` (`@repo/ui`) and a `fillHeight` mode on `CodeBlock`.
- [x] **P0-4**: ~~Add `memoryScope` (`latitude.memory.scope`) to the TS SDK.~~ **Superseded and removed** by the pre-Phase-3 scope-removal step — with scope deleted the attribute did nothing, so it was dropped from `constants/attributes.ts` + `ContextOptions` + the `processor.ts`/`tracer.ts` stamping paths.

**Exit gate (met):** a trace containing `create_memory`/`update_memory`/`search_memory` spans classifies them, shows the detail panel, colors them in the waterfall, and filters to them — no ledger yet.

**Phase 0 implementation notes (deviations from the original plan):**

- **No ClickHouse migration.** Filtering rides the indexed `operation` column; scalar memory attrs and the flattened `records` JSON ride `attr_string`/`attr_int`, already returned by the span-detail read path (`findBySpanId`).
- **The `arrayValue`/`kvlistValue` flattening is general** — every previously-dropped structured attribute now persists as a JSON string in `attr_string` (relying on `CODEC(ZSTD)`; add a length cap in `resolveAnyValue` if a pathological emitter bloats it).
- **`OPERATION_ICON`'s `satisfies` is vacuous** (the `z.string()` catch-all collapses the `Exclude` to `never`), so memory icon entries are a manual, non-compiler-enforced addition.
- **The web keeps its own `MEMORY_OPERATIONS`/`isMemoryOperation`** (`spans-tab/memory-operations.ts`, type-only domain import) instead of importing the domain runtime helper into the client bundle — accepted duplication of a 7-string list.
- **Records master-detail.** The records payload is validated against `gen-ai-memory-records.json` (`parseMemoryRecords`) and rendered as a two-pane list + content view; a new generic `MasterDetail` primitive was added to `@repo/ui` (with a design-system showcase entry) and a `fillHeight` mode to `CodeBlock`/`CodeMirrorReadonly` so content fills the pane and scrolls internally. Per-record change badges were dropped (see Feature 1 UI copy).
- **Trace-list read path hardened.** `listByTraceId` now returns empty attr maps (mirrors `listBySessionId`/`listByTraceIds`), so the flattened `gen_ai.memory.records` payloads — which this PR is what puts into `attr_string` — don't bloat the trace-list read; the span detail still reads attributes via `findBySpanId`.
- **Shared OTLP flattener.** The `arrayValue`/`kvlistValue`→JSON flattening lives in a single `otlp/any-value.ts` (`anyValueToPlain`), replacing three near-identical copies across `transform.ts`, the enricher, and the GenAI content parser.
- **Deferred to Phase 1:** `resolvers/memory.ts` + resolved fields / indexed columns and the `"update_memory · <record.id>"` tree-row label (needs `memoryRecordId` on the list-shape `SpanRecord`). *(A `scope` resolver + column was also listed here; the scope concept was dropped entirely pre-Phase-3, so it was never built.)*

### Phase 1 — Ledger, blobs, projection, materializer (engine)

- [x] **P1-1**: `ch:create` migrations for `memory_events` (`MergeTree`, `PARTITION BY toYYYYMM(end_time)`), `memory_blobs` (`ReplacingMergeTree(created_at)`, no partition), `memory_current` (`ReplacingMergeTree(end_time)`, no partition — a record's versions must stay in one partition to dedup). Unclustered + clustered pairs; `ch:up` + `ch:schema:dump` synced the chdb test schema.
- [x] **P1-2**: `@domain/memories` package (entities `memory-event`/`memory-record`/`memory-blob`/`memory-current`/`memory-snapshot`, `MemoryRepository` port, `./testing` fake, index) matching `@domain/scores`. New dep `js-tiktoken` (catalog).
- [x] **P1-3**: `memory-repository.ts` CH adapter — `insertEvents`, `upsertBlobs`, `upsertCurrent`, `readCurrentSnapshot`, `readManifestAt`, `readLatestStoreWipes`; chdb integration tests (dedup, point-in-time manifest, current snapshot, store wipes). *(Blame/session/store-list reads grow the port in Phases 2/3.)*
- [x] **P1-4**: `materialize-trace-memory` use-case (body → sha256 + `o200k_base` `token_count`, `change_kind` derivation incl. upsert add-vs-update and whole-store wipe, per-record fan-out) + `memory-projection` worker (topic-registry + `server.ts`) fanned out from `trace-end.ts`. Reads the trace's memory spans via a new `SpanRepository.listMemoryOperationSpansByTraceId` (memory attrs as scalar map lookups — no OOM).
- [x] **P1-5**: `reconstruct-snapshot` (`memory_current` for now, ledger argMax for point-in-time; store-wipe post-filter applied to both paths).

**Exit gate (met):** seeded memory spans populate the three tables; `reconstruct-snapshot(store, now)` and `reconstruct-snapshot(store, pastT)` return correct manifests in chdb integration tests; dedup verified (identical body ⇒ one blob).

**Phase 1 implementation notes (deviations from the original plan):**

- **Resolve at projection, not ingestion.** No spans-table migration and no `resolvers/memory.ts`; the materializer derives store/record/count/query/records from the already-stored span attributes at trace-end. *(A scope was originally resolved here too — `gen_ai.memory.scope` → `latitude.memory.scope` → span `user_id` → `""` — but was removed in the pre-Phase-3 step; `store_id` is now the sole key.)* Keeps Phase 1 additive and off the hot ingestion path. The Spans-tab niceties this defers (lean `memory_store_id`/`memory_record_id` columns, the `update_memory · <record.id>` tree label, server-side record filtering) remain a separate Feature-1 polish PR.
- **Blobs are inline-only in Phase 1.** `content_file_key` is reserved in the schema but always empty; the `putInDisk` object-storage overflow is deferred (it needs a new `memory` storage namespace, and record bodies are small / already stored inline in `spans` today). No `StorageDisk` dependency in the materializer or worker.
- **`memory_events` stays `MergeTree` (append-only).** A retried projection can append duplicate rows; reconstruction is `argMax`-based so duplicates are harmless. Phase-2 aggregations must dedup by `(span_id, store_id, record_id)`.
- **Retention:** `memory_events`/`memory_current` carry `retention_days` (default 90) + a TTL on `memory_events`; per-plan retention wiring and `memory_blobs` GC are follow-ups.
- **Idempotency at the boundary** rides the `trace-end` 90s debounce + the org-scoped `dedupeKey: org:{orgId}:memory-projection:{projectId}:{traceId}`.
- **Whole-store wipes tombstone `memory_current`.** A wipe writes a per-record `remove` into `memory_current` for the store's live records (not just the `store_delete` ledger event), so the current view survives ledger TTL and upsert add-vs-update stays correct after a wipe. See [D9](#decisions) / [Reconstruction](#reconstruct-a-manifest-at-time-t).

### Phase 2 — Diff and the session/trace summary (Feature 2)

Blame (originally P2-3) moved to **Phase 3**: its only surface is the Memory-page blame gutter, so it ships with that UI rather than ahead of it. The version-chain read it needs (`readRecordVersions`) already exists.

- [x] **P2-1**: `compute-memory-diff` (hash-prune + jsdiff + token deltas + record buckets).
- [x] **P2-2**: `compute-session-memory-summary` (read tokens + per-record endpoint write diff, churn collapse, concurrency rule).
- [x] **P2-4**: Summary chip in the session drawer + trace header; multi-store expansion. Click-through to Feature 4 deferred until that route exists (see Phase 4).

**Exit gate:** on seeded data, `read X · write +N −N` matches hand-computed values; a record changed twice in one session counts once (net).

**Phase 2 engine notes (P2-1/P2-2, deviations from the original plan):**

- **Blame deferred to Phase 3** (see above) — no `compute-memory-blame` / `memory-blame.ts` yet.
- **`diff` was not a workspace dependency.** Despite the original note, jsdiff (`diff` v8, BSD) lived only in `tools/ai-benchmarks`; Phase 2 adds it to the pnpm catalog and `@domain/memories` (ships its own TS types, no `@types/diff`).
- **New port reads:** `readBlobs`, `readSessionMemoryEvents` (rides the `memory_events.session_id` bloom filter; optional in-SQL trace filter), `readRecordVersions` (two `Array(String)` params — no `Array(Tuple)` support — with exact-pair filtering in the use-case). Every new aggregate dedups retried ledger rows by `(span_id, store_id, record_id)`.
- **Per-record reads (materializer change) + per-record summary.** `search_memory` now emits one read event per returned record keyed on the record's `id` (was one aggregate read keyed on the span's empty scalar `gen_ai.memory.record.id`, which produced a single unattributed "—" read). `compute-session-memory-summary` was reshaped from a per-scope to a per-record output (`records[]` + `total`); a record read *and* written merges into one entry. A content-hash fallback (match an id-less hit's body to a known record) was built then reverted — conformant emitters include record ids on search hits, so it was dead weight.
- **Re-projection caveat.** Read attribution and session-id stamping happen at materialization, so already-projected traces keep their old rows until re-projected; re-projecting without first truncating the memory tables double-counts (append-only ledger; the old aggregate read and the new per-record reads have different `(span_id, store_id, record_id)` keys and both survive dedup).
- **Shared token math.** `compute-memory-diff` is the manifest two-point diff (Feature 4 will consume it); `compute-session-memory-summary` applies the per-record endpoint rule directly. Both go through one `recordTokenDelta` helper (line diff + o200k_base tokens, degrading to record-level `tokenCount` when a body is absent) and a lifted `countTokens` tokenizer singleton.
- **No summary cache in v1** (the read is cheap; Redis + worker invalidation is a later lever).
- **Whole-store wipe in a session** counts the store's records live *just before* the wipe as removed (excluding records the session also touched). The live set is reconstructed via `reconstructSnapshotUseCase` at `wipeAt − 1ms`, which applies the D9 store-wipe post-filter; raw `readManifestAt(wipeAt)` (the first cut) re-counted records already dropped by an *earlier* wipe as removed again — fixed after the PR #4053 review, with a wipe → repopulate → wipe regression test.
- **Session id is stamped from the trace, not the span.** `session_id` is resolved per span at ingest and memory-operation spans routinely carry no session attribute (only sibling chat spans do), which left the ledger's `session_id` empty and the summary read (`WHERE session_id = …`) matching nothing. `trace-end` now passes the trace's canonical session id (`traceDetail.sessionId || traceId`, the same value it hands `session-end`) in the `memory-projection` payload, and `materialize-trace-memory` stamps it on every event. A trace belongs to one session, so this always agrees with the session/trace entity the summary opens from.
- **Tested** against the in-memory fake (`compute-memory-diff`; `compute-session-memory-summary` incl. per-record read/write, multi-scope, repeated-wipe double-count; per-record search reads; session-id stamping) and chdb (`readBlobs` / `readSessionMemoryEvents` / `readRecordVersions`; event `session_id` inherits the trace session even when the span's own differs).

**Phase 2 UI note (P2-4):**

- New `apps/web` `memories` domain (`memories.functions.ts` `getSessionMemorySummary` server fn over `MemoryRepositoryLive`, no cache; `memories.collection.ts` `useMemorySummary` hook). `@domain/memories` added as an `apps/web` dependency.
- `MemorySummary` (`-components/memory-summary.tsx`) is a `Memory` row in the trace `TraceTab` + session `MetadataTab` detail bodies, under Cost: read/added/removed token pills (a local `MetricPill` — the `@repo/ui` `Badge` forces an `xs` icon and its colored variants carry a border, so a small local pill was cleaner) that hover-open a per-record breakdown grouped by store (metrics toned per kind, capped 10, id-less reads → `—`). Renders nothing until loaded / when the session touched no memory. The trace variant passes `sessionId={traceRecord.sessionId || traceId}` so sessionless traces still resolve (matching the canonical id stamped at trace-end). Presentation iterated with the user through a header chip → detail-body text row → badges → the current pills + breakdown; the store click-through is wired in Phase 4 (P4-2).

### Pre-Phase-3 — Scope removal (`store_id` is the sole key)

Before building the Memory page, `scope` was deleted from the engine so the page rests on the real OTEL identity `(store_id, record_id)` rather than a derived-and-since-abandoned concept. Rationale + decision in [Store identity](#store-identity) / [D4](#decisions). Single-step column drop, accepted brief rolling-deploy window; tables were testing-phase with no durable data.

- [x] **PS-1**: CH migration `00053_memory_drop_scope` — recreate `memory_events` and `memory_current` without the `scope` column, re-keyed on `(store_id, record_id)` (`DROP + CREATE`, not a data-preserving rebuild). `memory_blobs` unchanged; chdb `schema.sql` regenerated.
- [x] **PS-2**: `@domain/memories` — drop `scope` from the entities; the `scope` param on `readCurrentSnapshot` / `readManifestAt` / `readLatestStoreWipes` becomes `storeId` and `readRecordVersions` drops it; `MemorySnapshot` / `MemoryDiff` / the session-summary record carry `storeId`. The materializer deletes `resolveScope` and seeds live records per store. Fake repo + CH adapter move in lockstep.
- [x] **PS-3**: `@domain/spans` — drop `scopeAttr` / `latitudeScopeAttr` from `MemoryOperationSpan`; the span adapter stops selecting `gen_ai.memory.scope` / `latitude.memory.scope`.
- [x] **PS-4**: TS SDK — remove the `memoryScope` capture option and `latitude.memory.scope` attribute (see the struck [P0-4](#phase-0--memory-spans-on-the-spans-tab-feature-1--shipped)).
- [x] **PS-5**: Web — the Feature-2 summary breakdown groups by store id, not scope.

**Semantics locked:** a store shared by two users is now one manifest (last-writer-wins across users), not one fragment per user — the change this step exists to make. Covered by a new materializer test.

### Phase 3 — The Memory page (Feature 3)

**Status: merged in #4083.** Blame (P3-3) is the one deferred item; the record detail ships an activity panel in its place.

- [x] **P3-1**: Nav entry (`project-sections.ts`, group `observe`) + `/memory` store-list route — one row per store (record count, tokens, last-updated, # sessions, # users, last read), server-sorted + offset-paginated. `listStores` is a single query: a `memory_current` per-store aggregate LEFT JOIN a `memory_events` per-store aggregate (`uniqExactIf` sessions/users, `maxIf` last-read).
- [x] **P3-2**: `/memory/$store` store-detail — filetree (record ids split on `/`), read-only content pane (JSON-detected), and the store's accessor list (new port read `listStoreUsers`). **The per-line blame gutter was replaced by the Record Activity panel (P3-5); blame stays deferred to P3-3.**
- [ ] **P3-3**: `compute-memory-blame` (version-walk attribution to span/trace) + per-line blame gutter. **Still deferred** — the Memory page shipped without it; the activity panel covers change history for now ([D13](#decisions)). Reads via the existing `readRecordVersions` + `readBlobs`.
- [x] **P3-4**: "Memory stores accessed" section on `…/users/$userId/` (sibling of `user-behaviours-section`), each store linking to `/memory/$store`, backed by `listUserStores` (stores-per-user).
- [x] **P3-5**: **Record Activity panel** — a resizable VSCode-style bottom panel with **Changes** / **Reads** / **Users** tabs and session-drawer click-through. New port reads `readRecordReadEvents` (per-record retrievals, deduped + capped at 200) and `listRecordUsers` (per-record read/write roll-up); `userId` added to `readRecordVersions` for the Changes tab.
- [x] **P3-6**: Gate both routes behind `memoryObservability` ([D14](#decisions)) — render an unavailable state + disable queries when off; collision-free `~`-sentinel URL encoding for the `""` store and unnamed record.

**Exit gate (met, minus blame):** a store with multiple records renders as a tree with correct current bodies; the record detail shows its change/read history and who accessed it, with click-through to sessions; the store lists its users and a user lists their stores. Per-line blame links (P3-3) remain the one outstanding Phase-3 item.

### Phase 4 — Commit-style session diff view (Feature 4)

- [ ] **P4-1**: `/memory/$store?session=…` route: time-travel snapshot at session end, changed-file badges, per-file unified/split diff, header summary + trace link. Backed by `compute-memory-diff` (built in Phase 2).
- [ ] **P4-2**: Wire the Feature 2 summary's click-through (deferred from Phase 2) to this route — `MemorySummary` in the session/trace detail bodies links each store row to `/memory/{store}?session={id}`.

**Exit gate:** clicking through from the session's memory summary lands on the store as-of that session, marks exactly the files it changed, and shows a correct per-file diff.

### Later (out of this spec)

- Provider adapters (Mem0 first: webhook/history → same tables via `source`).
- `memory-pollution` flagger → signals; rollback-report ("flag polluted trace → affected changes → inverse operations").
- Snapshot checkpoints for high-volume stores.
