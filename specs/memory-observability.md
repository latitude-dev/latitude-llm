# Memory Observability

> **Documentation** — durable homes after stabilization: a new `dev-docs/memory-observability.md`. Related current docs: `dev-docs/spans.md` (span ingestion/storage/query, which this extends), `dev-docs/scores.md` + `specs/signals.md` (the flagger/signal spine a future memory-pollution detector plugs into), `dev-docs/users.md` (user identity, the default scope key), `dev-docs/projects.md` (project-scoped tenancy).
>
> **Linear**: [LAT-729](https://linear.app/latitude/issue/LAT-729) — "Explore: Memory observability (memory diff / evolution tracking)".

## Contents

1. [Purpose](#purpose)
2. [Scope and non-goals](#scope-and-non-goals)
3. [Ground truth: the OTEL memory conventions](#ground-truth-the-otel-memory-conventions)
4. [The git model we borrow](#the-git-model-we-borrow)
5. [Architecture](#architecture)
6. [Scope resolution](#scope-resolution)
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
- A `@domain/memories` package that reconstructs a scope's state at any point in time, diffs two points, and computes per-line blame.
- Four product surfaces: memory spans on the Spans tab; a per-session/trace read/write summary; a Memory page (scope list → filetree + content + blame); and a commit-style session diff view.

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

1. **There is no `gen_ai.memory.scope` attribute** (contrary to an earlier internal report). Scope/layering must be derived — see [Scope resolution](#scope-resolution).
2. **There is no before/after on the wire, and no token count.** `gen_ai.memory.records` is the *current* content of the records in that operation (opt-in). A diff and a token count are things **we derive**, not read. `record.count` is the only always-available quantity.

`gen_ai.memory.records` content model (`model/gen-ai/gen-ai-memory-records.json`, verified): an **array** of records where **`content` (`any`) is the only required field**, plus optional `id` (string), `score` (number, populated on search results), and `metadata` (object). The record object also sets **`additionalProperties: true`** — extra keys are tolerated but undefined by the standard. Notably there is **no `moved_from`/rename field and no rename operation**: a rename is not representable from a single span and is a derived (ledger/Phase 1) concern, not a wire fact. Because the attribute is declared `any` and is `development`-stage, emitters may deviate — consumers validate the shape and fall back to the raw payload. We treat, per record, the `content` field (stringified if object) as that record's new full body.

---

## The git model we borrow

git is fast because it **stores snapshots, not diffs**, and makes snapshots cheap with content addressing. We steal exactly four ideas:

1. **Content addressing + dedup.** Hash each record body; store each unique body once (`memory_blobs`). A record written identically twice costs one blob.
2. **A version is a manifest of hashes.** "State of scope at time T" = the set of `(record → content_hash)` current as of T. Unchanged records share a hash, so a full snapshot is a small list, not a copy of every body.
3. **Diffs are computed on demand and pruned by hash equality.** To diff two points, compare their manifests; where a record's hash is equal on both sides it is provably unchanged — skip it. Only line-diff the records whose hash differs. Cost ∝ what changed.
4. **Delta/zlib packing is a storage-layer concern.** We get this from ClickHouse `CODEC(ZSTD)` on the blob column; we do not build git's packfile delta chains.

Where our world is **simpler** than git: a flat namespace of records (no recursive trees — we split `record.id` on `/` only for UX), no merges/branches, small bodies.

Where it is **harder**: memory is multi-tenant append-only telemetry we don't control; a shared scope is written concurrently by many sessions with no parent pointers. Decision [D2](#decisions) resolves this by the simplest rule that works: **each mutating span carries the full new body of the record it touches, i.e. each span is a full snapshot of that record; versions are ordered by span end-time; last-to-finish wins as current.** No parent-pointer isolation, no three-way merge — just "latest write per record."

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
  reconstructSnapshot(scope, at)   → manifest {record → blob} via argMax over ledger (or memory_current for now)
  computeDiff(scope, from, to)     → hash-prune + jsdiff on survivors → {added/updated/removed, +/- tokens}
  computeBlame(scope, record, at)  → walk versions newest→oldest, attribute lines → span_id/trace_id
  sessionSummary(session)          → read tokens (search spans) + write diff (before vs after)
```

Materialization runs at the **trace-end boundary** (`apps/workers/src/workers/trace-end.ts`), not inline in ingestion, because that is the settled point where a record's final body within a trace and a stable end-time ordering are known. It is added as its own worker/queue step exactly like the deterministic-flaggers fan-out already is (isolated failure domain).

New/changed code:

- `packages/domain/spans/src/entities/span.ts` — extend `operationSchema` with the 7 memory ops; export `MEMORY_OPERATIONS` / `isMemoryOperation`.
- `packages/domain/spans/src/otlp/transform.ts` — `resolveAnyValue` flattens OTLP `arrayValue`/`kvlistValue` attributes to a JSON string so structured payloads (e.g. `gen_ai.memory.records`) survive in `attr_string`.
- `packages/domain/spans/src/otlp/resolvers/memory.ts` — new resolver (candidate lists for store/record/count/query/records/scope), wired into `resolvers/index.ts` and `transform.ts`. *(Phase 1 — Phase 0 reads the raw attributes instead.)*
- `packages/domain/memories/*` — new domain package (entities, ports, use-cases; see [Data model](#data-model)).
- `packages/platform/db-clickhouse/src/repositories/memory-repository.ts` — CH adapter + migrations (`memory_events`, `memory_blobs`, `memory_current`), created via `pnpm --filter @platform/db-clickhouse ch:create`.
- `apps/workers/src/workers/memory-projection.ts` — trace-end-triggered materializer.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/memory/*` + a nav entry in `apps/web/src/layouts/AppSidebar/index.tsx`; memory-span detail section under `-components/trace-detail-drawer/tabs/spans-tab/span-detail/`.

---

## Scope resolution

Scope is the unit the Memory page lists and the filetree groups under. There is no standard attribute, so we resolve a `scope` string per memory span with an ordered candidate list (same `first(candidates, attrs)` pattern as `resolvers/identity.ts`). Decision [D4](#decisions):

1. `gen_ai.memory.scope` — forward-compatible with a possible future standard attribute.
2. `latitude.memory.scope` — our own convention (added to `packages/telemetry/typescript/src/constants/attributes.ts` as `memoryScope`, and to the SDK capture options), so a customer with layered user/team/company memory can tag each write explicitly.
3. the span's resolved **user id** (`user.id` / existing `identity.ts` userId candidates).
4. `""` (empty string) — an explicit "unscoped" bucket that is its own scope, never dropped.

Record identity within a scope is `(store_id, record_id)`. The UI filetree path is `"{store_id}/{record_id}"` split on `/`, so `store.id` becomes the top-level folder when a scope spans multiple stores, and slash-delimited record ids nest naturally. `store_id` absent ⇒ path is just `record_id`.

> **Requirement to document for customers**: user-scoping only works if the memory span (or its trace) carries user identity, or the emitter sets a `*.memory.scope` attribute. Spans with neither land in the `""` scope.

---

## Data model

Three ClickHouse tables (append-only migration rules apply; create with `ch:create`, never by hand) plus a Zod-first domain package. All tables are `organization_id`/`project_id` scoped.

### `memory_events` — the ledger (source of truth)

One row per memory-operation span (mutations **and** reads). `MergeTree`.

| Column | Type | Notes |
| --- | --- | --- |
| `organization_id`, `project_id` | String | tenancy |
| `scope` | String | resolved per [Scope resolution](#scope-resolution) |
| `store_id` | String | `gen_ai.memory.store.id` (`''` if absent) |
| `record_id` | String | `gen_ai.memory.record.id` (`''` for store-lifecycle / whole-store deletes) |
| `operation` | LowCardinality(String) | one of the 7 ops |
| `change_kind` | LowCardinality(String) | derived: `add` / `update` / `remove` / `read` / `store_create` / `store_delete` (see below) |
| `content_hash` | String | sha256 hex of the record body; `''` when no content was sent |
| `token_count` | UInt32 | tiktoken over the body (0 when no content) |
| `record_count` | UInt32 | `gen_ai.memory.record.count` |
| `query_text` | String CODEC(ZSTD(3)) | for `search_memory` |
| `span_id` | FixedString(16) | authoring span (blame target) |
| `trace_id` | FixedString(32) | |
| `session_id` | String | `gen_ai.conversation.id` (join key for session summary) |
| `user_id` | String | resolved user identity |
| `start_time`, `end_time` | DateTime64(6) | **ordering is by `end_time`** ([D2](#decisions)) |
| `source` | LowCardinality(String) | `'otlp'` today; reserved for provider adapters ([D10](#decisions)) |
| `ingested_at` | DateTime64 | |

`ORDER BY (organization_id, project_id, scope, store_id, record_id, end_time, span_id)`, `PARTITION BY toYYYYMM(end_time)`.

`change_kind` derivation at materialization:
- `search_memory` → `read` (never mutates the manifest).
- `create_memory` → `add`; `update_memory` → `update`.
- `upsert_memory` → `add` if the record had no prior mutating event in scope, else `update`.
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

Latest mutating version per record, for fast "current snapshot" reads (T = now). `ReplacingMergeTree(end_time)` keyed `(organization_id, project_id, scope, store_id, record_id)`, one row upserted per mutating event, carrying `content_hash`, `change_kind`, `span_id`, `trace_id`, `session_id`, `token_count`, `end_time`. Reads take the latest row per key (`FINAL`/`argMax`) and drop `change_kind = 'remove'`. Point-in-time reads (T ≠ now) do **not** use this table — they aggregate the ledger. A whole-store wipe writes a `remove` row here for every live record in the store (a tombstone), so the current view reflects the wipe without depending on the ledger's `store_delete` event. This table carries **no TTL** — it is bounded by live-record count, and the wipe tombstones must outlive the ledger's retention.

### Domain package `packages/domain/memories`

Mirrors `@domain/scores` layout (`package.json` `@domain/memories`, `main`/`types` → `src/index.ts`, `./testing` export; deps `@domain/spans`, `@domain/shared`, `@domain/events`, `effect`, `zod`, plus `diff` and the tokenizer):

- `src/entities/` — `memory-event.ts`, `memory-record.ts`, `memory-snapshot.ts` (`{ scope, at, records: Manifest }`), `memory-diff.ts` (`{ added, updated, removed, tokensAdded, tokensRemoved, recordsChanged }`), `memory-blame.ts` (`Array<{ line, spanId, traceId, sessionId, at }>`).
- `src/ports/memory-repository.ts` — `insertEvents`, `upsertBlobs`, `upsertCurrent`, `readCurrentSnapshot(scope)`, `readManifestAt(scope, at)`, `readRecordVersions(scope, store, record, at?)`, `readSessionMemoryEvents(session)`, `listScopes`, `readBlobs(hashes)`.
- `src/use-cases/` — `materialize-trace-memory.ts`, `reconstruct-snapshot.ts`, `compute-memory-diff.ts`, `compute-memory-blame.ts`, `compute-session-memory-summary.ts`, `list-memory-scopes.ts`.
- `src/testing/` — fake repository (chdb testkit in integration tests).

---

## Reconstruction, diff, and blame

ClickHouse cannot line-diff; it owns storage + manifest reconstruction, and `@domain/memories` owns the text algorithms (`diff` = jsdiff v8, already a workspace dependency; tokenizer = `js-tiktoken`).

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
  AND scope = {scope}
  AND change_kind IN ('add','update','remove')
  AND end_time <= {at}
GROUP BY store_id, record_id
HAVING change_kind != 'remove'
```

Whole-store wipes (`delete_memory` without `record.id`, and `delete_memory_store`) are handled two ways. At materialization the wipe writes a `remove` tombstone into `memory_current` for each of the store's live records, so the `T = now` read (which shortcuts to `memory_current`) reflects the wipe directly and durably. The ledger keeps no per-record tombstone, so point-in-time reads (T ≠ now) apply a post-filter: for each `store_id`, drop records whose latest mutation `end_time` is earlier than the store's latest wipe `end_time ≤ {at}`. The post-filter runs on both paths; for `T = now` it is redundant with the tombstones but harmless.

Scaling lever (deferred, [D7](#decisions)): if a scope's event count grows large, periodic materialized snapshot checkpoints per scope turn point-in-time into "nearest checkpoint + short forward scan" — git's commit-tree tradeoff. Not built in v1.

### Diff between two points

Reconstruct manifest at `from` and at `to`; join on `(store_id, record_id)`:
- present only in `to` → **added**; only in `from` → **removed**; both but `content_hash` differs → **updated**; **equal hash ⇒ skip** (the prune).
- For added/updated/removed, fetch bodies from `memory_blobs` and run `diffLines` (jsdiff). `tokensAdded` = tiktoken over inserted segments, `tokensRemoved` = tiktoken over deleted segments (a whole added record = all its tokens added; a removed record = all removed). `recordsChanged` = counts per bucket.
- Result renders as `+N −N tokens` and `+A ~U −R records`. Fallback to line counts when a body is absent ([D5](#decisions)).

Because diff compares **endpoints only**, intra-window churn collapses for free — a record added then removed in the same window is equal-or-absent at both ends and nets out. This is the "compare initial to final, not sum of edits" requirement.

### Session / trace write diff (the concurrency rule)

Per [D2](#decisions), a session's write contribution is computed **per record it touched**, endpoint-to-endpoint, over that record's own version chain:

For each `(store_id, record_id)` the session mutated: `before` = the body current just before the session's first mutating event on that record; `after` = the body at the session's last mutating event on that record. Diff `before → after`. Sum across records. When no other session interleaved that record, this equals the clean two-point diff; when interleaving happened, "last-to-finish wins" ([D2](#decisions)) defines `before`/`after` unambiguously by end-time, and the UI is honest that concurrent writers share a scope. Trace-level summary is the same restricted to one `trace_id`.

### Blame

Per record at T: load its mutating versions ordered by `end_time` (each carries full body + `span_id`/`trace_id`/`session_id`). Walk newest→oldest, diffing consecutive versions with jsdiff; a line unchanged from the older version is attributed downward, a line introduced by the newer version is attributed to it. Terminate when every current line is assigned. Output maps each current line → the last span that wrote it, linking to that trace. On demand (files are small); materialize only if a view proves hot.

---

## Feature 1 — memory spans on the Spans tab

**Goal:** the 7 memory operations are first-class spans: classified, colored, filterable, with a detail panel.

- **Classification:** add the ops to `operationSchema` (`span.ts`). `resolveOperation` already reads `gen_ai.operation.name`, so they classify with no extra mapping; the enum entry unlocks first-class icon/color and filtering. `resolvers/memory.ts` extracts `store.id`, `record.id`, `record.count`, `query.text`, and `records` into resolved fields (and, passively, dot-flattened attrs already land in `attr_string`/metadata).
- **Rendering (shipped):** `memory-operation-section.tsx` under `span-detail/` renders one **Memory** section — `query.text` for reads, then the records. When the payload matches the record schema it renders as a **master-detail** (a records rail + a content pane that fills edge-to-edge and scrolls internally; header `[db] <store id> (N)`; `search_memory` results sort by `score`); off-schema/absent payloads fall back to the raw JSON or "Content not captured". Store + count ride the records header; identity fields (`store.id`/`record.id`/`record.count`) drop to a summary row only when there's no records table. An icon in `span-tree/span-icon.tsx`, a color in the operation color map (the operation-coloring introduced by #4023), and a filter entry in `span-filters.ts`. Built on a reusable `MasterDetail` (`@repo/ui`) + a `fillHeight` mode on `CodeBlock`. The "View in Memory →" link to the scope page is deferred until Feature 3/4 exist.
- **No storage dependency** — ships independently of the ledger.

**UI copy:** `search_memory` results render under a "Results" subsection; the other operations render their records under "Records". Per-record change badges (create/update/delete/rename icons) were explored and **dropped**: a span's `operation` is uniform across all records it carries, so a meaningful per-record change kind (and rename detection) is a Phase 1 / Memory-page concern, not something derivable in the span detail.

---

## Feature 2 — session / trace memory summary

**Goal:** a compact chip on session and trace views: `read 412k · write +612 −24` (tokens), plus `+A ~U −R records` on expand.

- **Read** = Σ `token_count` of the blobs returned by `search_memory` spans in the session/trace (tiktoken approx over `gen_ai.memory.records`). When content is absent, degrade to record count (`read 3 records`). ([D5](#decisions))
- **Write** = the session/trace write diff from [Reconstruction § session write diff](#session--trace-write-diff-the-concurrency-rule): `+N −N tokens` derived from the endpoint line diff, churn collapsed. Fallback to `+/- lines` if a body is missing.
- **Placement:** `-components/session-detail-drawer.tsx` and the trace detail header. Computed by `compute-session-memory-summary` (cached per session/trace; recomputed when the memory-projection worker writes new events for that session).
- **Click-through:** the write chip links to Feature 4 (`/memory/{scope}?session={id}`). If the session touched multiple scopes, the chip expands to one row per scope.

---

## Feature 3 — the Memory page

**Goal:** browse the current state of any scope like a repo.

- **Nav + routes:** a "Memory" entry in `apps/web/src/layouts/AppSidebar/index.tsx`; routes:
  - `…/projects/$projectSlug/memory/index.tsx` — **scope list**: one row per scope (userId / scope-attr / `""`), with file count, total tokens, last-updated, and # sessions that wrote it. Backed by `list-memory-scopes` over `memory_current`.
  - `…/projects/$projectSlug/memory/$scope/index.tsx` — **scope detail**: left filetree (from `{store_id}/{record_id}` split on `/`) for the latest snapshot; right pane shows the selected record's current body; a per-line **blame gutter** where each line links to the span/trace that last wrote it (`compute-memory-blame`).
- **Latest snapshot** uses `memory_current` (hot). Empty/`""` scope is listed explicitly.
- Deleted records disappear from the tree; a "show deleted" toggle can surface tombstones (nice-to-have, not required for v1).

---

## Feature 4 — commit-style session diff view

**Goal:** from a session's write chip, land on the scope at that session and read it like a GitHub commit.

- **Route:** `…/memory/$scope/index.tsx?session={sessionId}` (or `…/memory/$scope/sessions/$sessionId`). Header shows the session/trace link and the `+N −N tokens · +A ~U −R records` summary.
- **Time-travel snapshot:** reconstruct the scope's manifest **as of the session's end** (`reconstruct-snapshot(scope, at=sessionEnd)`), so the tree reflects history, not "now".
- **Changed files marked:** files the session added/updated/removed get badges in the tree; selecting one shows a unified (default) / split diff of `before → after` for that record (the session write diff). Unchanged files are browsable but unmarked.
- This is the surface that realizes LAT-729's "each change references the trace that caused it," at commit granularity.

---

## Metering, retention, tenancy, self-hosting

- **Metering:** memory operations are spans; they are metered by the existing span/trace usage path. No new meter. ([D11](#decisions))
- **Retention:** `memory_events` carries a TTL (`retention_days + 30`). `memory_current` has **no TTL** (bounded by live-record count; its wipe tombstones must outlive the ledger). `memory_blobs` has **no TTL or GC yet** and grows unbounded until a collector drops hashes no retained event references — a pre-GA lever, alongside a **memory-body size cap** (content is uncapped and stored inline today, [D1](#decisions)); these two are the storage levers that matter before high-volume GA, not day-one cost. Point-in-time reconstruction older than blob retention degrades to hashes/ids without bodies.
- **Tenancy:** every table is `organization_id`/`project_id` scoped; `scope` strings are opaque and org-partitioned; blob dedup is per-org (never cross-tenant).
- **Self-hosting:** no new infrastructure — blobs inline in ClickHouse (ZSTD), with the object-storage fallback using the existing `@platform/storage-object` `StorageDisk` (SeaweedFS by default). New deps `js-tiktoken` (MIT) and the already-present `diff`/jsdiff (BSD) are permissive and satisfy the OSS bundle rule; audit transitive additions when adding `js-tiktoken`.

---

## Decisions

- **D1 — Content/PII not gated (v1).** Store `gen_ai.memory.records` content as sent; degrade gracefully when absent. Revisit consent/redaction/retention before GA. *(User call.)*
- **D2 — Span = full record snapshot; last-to-finish wins.** Each mutating span carries the full new body of the record it touches; versions order by `end_time`; the latest is current. No parent-pointer isolation, no merge. *(User call.)*
- **D3 — Record identity = `(store_id, record_id)`; UI path = `"{store_id}/{record_id}"` split on `/`.** Records need not be real files. *(User call.)*
- **D4 — Scope resolution order:** `gen_ai.memory.scope` → `latitude.memory.scope` → resolved `user.id` → `""`. *(User call.)*
- **D5 — Read metric = approx tokens (js-tiktoken), fallback record count. Write metric = `+/− tokens` from the endpoint line diff (fallback lines) + records changed.** *(User call.)*
- **D6 — Git-style storage:** content-addressed `memory_blobs` (dedup) + `memory_events` ledger + `memory_current` projection. Store snapshots, derive diffs.
- **D7 — Reconstruction:** current-state via `memory_current`; point-in-time / diff / blame on demand in `@domain/memories`. Per-scope snapshot checkpoints deferred until volume demands.
- **D8 — Materialization at the trace-end boundary** via a dedicated `memory-projection` worker (isolated failure domain, mirrors deterministic-flaggers).
- **D9 — Delete semantics:** `delete_memory` with `record.id` = record remove; without `record.id` = whole-store wipe; `delete_memory_store` = whole-store wipe of that store. A whole-store wipe writes a `store_delete` ledger event **and** a per-record `remove` tombstone into `memory_current` for every live record in the store, so the current view survives the ledger's retention TTL and a later `upsert` of a wiped record classifies as `add` (the seed snapshot is wipe-aware); point-in-time reconstruction additionally applies the post-filter by store wipe time.
- **D10 — Provider adapters out of scope**, but `memory_events.source` reserved so Mem0/Supermemory/Zep can write the same tables later.
- **D11 — No billing change**; memory ops ride span metering.
- **D12 — Tenancy:** all tables org+project scoped; blob dedup per-org.

---

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 0 — Memory spans on the Spans tab (Feature 1) — shipped

Phase 0 reads memory attributes straight from `attr_string`/`attr_int` + the indexed `operation` column; **no ClickHouse migration and no memory resolver** (both move to Phase 1 with the ledger).

- [x] **P0-1**: Add the 7 memory operations to `operationSchema` + export `MEMORY_OPERATIONS` / `isMemoryOperation` (`packages/domain/spans/src/entities/span.ts`).
- [x] **P0-2**: Capture structured attributes — `resolveAnyValue` (`packages/domain/spans/src/otlp/transform.ts`) flattens `arrayValue`/`kvlistValue` to a JSON string so `gen_ai.memory.records` survives in `attr_string`. (Dedicated `resolvers/memory.ts` + resolved fields/columns deferred to Phase 1.)
- [x] **P0-3**: Spans-tab rendering — `span-detail/memory-operation-section.tsx` detail panel (reads attr maps), memory icons (`span-icon.tsx`), waterfall color (`span-tree/helpers.ts`), and a "Memory" filter toggle (`span-filters.ts` / `use-span-filters.ts` / `span-filters-bar.tsx`). Shared `isMemoryOperation` in `spans-tab/memory-operations.ts`. The records payload renders as a schema-validated master-detail (`memory-records.tsx` + `memory-records-parse.ts`) built on a new reusable `MasterDetail` (`@repo/ui`) and a `fillHeight` mode on `CodeBlock`.
- [x] **P0-4**: Add `memoryScope` (`latitude.memory.scope`) to the TS SDK (`constants/attributes.ts` + `ContextOptions` + both `processor.ts`/`tracer.ts` stamping paths); documented the scope/user-tagging requirement. (Ingest-side `scope` resolver deferred to Phase 1.)

**Exit gate (met):** a trace containing `create_memory`/`update_memory`/`search_memory` spans classifies them, shows the detail panel, colors them in the waterfall, and filters to them — no ledger yet.

**Phase 0 implementation notes (deviations from the original plan):**

- **No ClickHouse migration.** Filtering rides the indexed `operation` column; scalar memory attrs and the flattened `records` JSON ride `attr_string`/`attr_int`, already returned by the span-detail read path (`findBySpanId`).
- **The `arrayValue`/`kvlistValue` flattening is general** — every previously-dropped structured attribute now persists as a JSON string in `attr_string` (relying on `CODEC(ZSTD)`; add a length cap in `resolveAnyValue` if a pathological emitter bloats it).
- **`OPERATION_ICON`'s `satisfies` is vacuous** (the `z.string()` catch-all collapses the `Exclude` to `never`), so memory icon entries are a manual, non-compiler-enforced addition.
- **The web keeps its own `MEMORY_OPERATIONS`/`isMemoryOperation`** (`spans-tab/memory-operations.ts`, type-only domain import) instead of importing the domain runtime helper into the client bundle — accepted duplication of a 7-string list.
- **Records master-detail.** The records payload is validated against `gen-ai-memory-records.json` (`parseMemoryRecords`) and rendered as a two-pane list + content view; a new generic `MasterDetail` primitive was added to `@repo/ui` (with a design-system showcase entry) and a `fillHeight` mode to `CodeBlock`/`CodeMirrorReadonly` so content fills the pane and scrolls internally. Per-record change badges were dropped (see Feature 1 UI copy).
- **Trace-list read path hardened.** `listByTraceId` now returns empty attr maps (mirrors `listBySessionId`/`listByTraceIds`), so the flattened `gen_ai.memory.records` payloads — which this PR is what puts into `attr_string` — don't bloat the trace-list read; the span detail still reads attributes via `findBySpanId`.
- **Shared OTLP flattener.** The `arrayValue`/`kvlistValue`→JSON flattening lives in a single `otlp/any-value.ts` (`anyValueToPlain`), replacing three near-identical copies across `transform.ts`, the enricher, and the GenAI content parser.
- **Deferred to Phase 1:** `resolvers/memory.ts` + resolved fields / indexed columns, the ingest-side `scope` resolver + column, and the `"update_memory · <record.id>"` tree-row label (needs `memoryRecordId` on the list-shape `SpanRecord`).

### Phase 1 — Ledger, blobs, projection, materializer (engine)

- [x] **P1-1**: `ch:create` migrations for `memory_events` (`MergeTree`, `PARTITION BY toYYYYMM(end_time)`), `memory_blobs` (`ReplacingMergeTree(created_at)`, no partition), `memory_current` (`ReplacingMergeTree(end_time)`, no partition — a record's versions must stay in one partition to dedup). Unclustered + clustered pairs; `ch:up` + `ch:schema:dump` synced the chdb test schema.
- [x] **P1-2**: `@domain/memories` package (entities `memory-event`/`memory-record`/`memory-blob`/`memory-current`/`memory-snapshot`, `MemoryRepository` port, `./testing` fake, index) matching `@domain/scores`. New dep `js-tiktoken` (catalog).
- [x] **P1-3**: `memory-repository.ts` CH adapter — `insertEvents`, `upsertBlobs`, `upsertCurrent`, `readCurrentSnapshot`, `readManifestAt`, `readLatestStoreWipes`; chdb integration tests (dedup, point-in-time manifest, current snapshot, store wipes). *(Blame/session/scope-list reads grow the port in Phases 2/3.)*
- [x] **P1-4**: `materialize-trace-memory` use-case (body → sha256 + `o200k_base` `token_count`, `change_kind` derivation incl. upsert add-vs-update and whole-store wipe, per-record fan-out) + `memory-projection` worker (topic-registry + `server.ts`) fanned out from `trace-end.ts`. Reads the trace's memory spans via a new `SpanRepository.listMemoryOperationSpansByTraceId` (memory attrs as scalar map lookups — no OOM).
- [x] **P1-5**: `reconstruct-snapshot` (`memory_current` for now, ledger argMax for point-in-time; store-wipe post-filter applied to both paths).

**Exit gate (met):** seeded memory spans populate the three tables; `reconstruct-snapshot(scope, now)` and `reconstruct-snapshot(scope, pastT)` return correct manifests in chdb integration tests; dedup verified (identical body ⇒ one blob).

**Phase 1 implementation notes (deviations from the original plan):**

- **Resolve at projection, not ingestion.** No spans-table migration and no `resolvers/memory.ts`; the materializer derives store/record/count/query/records + scope (`gen_ai.memory.scope` → `latitude.memory.scope` → span `user_id` → `""`) from the already-stored span attributes at trace-end. Keeps Phase 1 additive and off the hot ingestion path. The Spans-tab niceties this defers (lean `memory_store_id`/`memory_record_id` columns, the `update_memory · <record.id>` tree label, server-side record filtering) remain a separate Feature-1 polish PR.
- **Blobs are inline-only in Phase 1.** `content_file_key` is reserved in the schema but always empty; the `putInDisk` object-storage overflow is deferred (it needs a new `memory` storage namespace, and record bodies are small / already stored inline in `spans` today). No `StorageDisk` dependency in the materializer or worker.
- **`memory_events` stays `MergeTree` (append-only).** A retried projection can append duplicate rows; reconstruction is `argMax`-based so duplicates are harmless. Phase-2 aggregations must dedup by `(span_id, store_id, record_id)`.
- **Retention:** `memory_events`/`memory_current` carry `retention_days` (default 90) + a TTL on `memory_events`; per-plan retention wiring and `memory_blobs` GC are follow-ups.
- **Idempotency at the boundary** rides the `trace-end` 90s debounce + the org-scoped `dedupeKey: org:{orgId}:memory-projection:{projectId}:{traceId}`.
- **Whole-store wipes tombstone `memory_current`.** A wipe writes a per-record `remove` into `memory_current` for the store's live records (not just the `store_delete` ledger event), so the current view survives ledger TTL and upsert add-vs-update stays correct after a wipe. See [D9](#decisions) / [Reconstruction](#reconstruct-a-manifest-at-time-t).

### Phase 2 — Diff, blame, and the session/trace summary (Feature 2)

- [ ] **P2-1**: `compute-memory-diff` (hash-prune + jsdiff + token deltas + record buckets).
- [ ] **P2-2**: `compute-session-memory-summary` (read tokens + per-record endpoint write diff, churn collapse, concurrency rule).
- [ ] **P2-3**: `compute-memory-blame` (version-walk attribution to span/trace).
- [ ] **P2-4**: Summary chip in `session-detail-drawer.tsx` + trace header; multi-scope expansion; click-through to Feature 4.

**Exit gate:** on seeded data, `read X · write +N −N` matches hand-computed values; a record changed twice in one session counts once (net); blame attributes each line to the correct span.

### Phase 3 — The Memory page (Feature 3)

- [ ] **P3-1**: Nav entry + `/memory` scope-list route (`list-memory-scopes`).
- [ ] **P3-2**: `/memory/$scope` scope-detail: filetree (path split), content pane, blame gutter linking to traces.

**Exit gate:** a scope with multiple stores/records renders as a tree with correct current bodies and working per-line blame links.

### Phase 4 — Commit-style session diff view (Feature 4)

- [ ] **P4-1**: `/memory/$scope?session=…` route: time-travel snapshot at session end, changed-file badges, per-file unified/split diff, header summary + trace link.

**Exit gate:** clicking a session's write chip lands on the scope as-of that session, marks exactly the files it changed, and shows a correct per-file diff.

### Later (out of this spec)

- Provider adapters (Mem0 first: webhook/history → same tables via `source`).
- `memory-pollution` flagger → signals; rollback-report ("flag polluted trace → affected changes → inverse operations").
- Snapshot checkpoints for high-volume scopes.
