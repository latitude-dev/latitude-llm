# Trace Search: Per-Turn Conversation Chunking

## Spec Contract

Replace the single per-trace embedding with one embedding per conversation turn. Embeddings live in `trace_search_embeddings` keyed by `(org, project, trace, chunk_index)`. Retrieval rolls chunks up to a per-trace score via `max(cosine_similarity) GROUP BY trace_id`.

## Motivation

The current pipeline embeds each trace's whole conversation as a single Voyage vector. That works for short traces but degrades on long agent runs:

- A 20-turn agent transcript collapses to one ~5k-token vector. Specific moments inside the trace (a tool call, a clarification, a handoff) get smeared across a single mean direction.
- Cosine similarity against a focused user query (`pricing complaint`) ends up dominated by the bulk of unrelated turns. Real matches sit deeper in the result set than they should.
- The current 5k-token document cap quietly truncates the middle of long traces, dropping potentially-matching turns entirely.

Per-turn chunks turn this into a multi-vector retrieval problem: each turn is its own searchable unit, and a query matches a trace if any of its turns matches well. Max-pooling at read time keeps the score interpretation simple — `relevance_score` is "how well does the best moment of this trace match the query", which is what users actually mean.

The ILIKE→text-index migration (`specs/trace-search.md`) already split lexical and semantic into independent operators. This spec only changes the semantic side; lexical still operates on the whole-trace document.

## Scope

In scope:

- Per-turn chunking helper that produces `readonly TraceSearchChunk[]` from a `TraceDetail`. Per-chunk content hash. Cap on chunk size (~1000 tokens) with overlap on overflow.
- Cap on chunks per trace so a runaway agent loop can't blow the per-trace embedding cost.
- Schema migration: rebuild `trace_search_embeddings` with `chunk_index` in PK via `EXCHANGE TABLES` swap.
- Worker rewrite: embed each chunk, upsert one row per chunk, dedupe per chunk via per-chunk hash.
- Repository read: `buildSemanticSearchSubquery` rolls up via `max(...) GROUP BY trace_id`. `SEMANTIC_SCAN_LIMIT` becomes a chunk-row limit (bump appropriately).
- Backfill: reuse `trace-search:backfill` to re-embed every existing trace into the new shape.

Out of scope:

- Surfacing the best-matching chunk in the UI (e.g. snippet highlighting, jump-to-turn). Future work; this spec keeps the API surface unchanged so the UI doesn't need to know chunks exist.
- Sliding-window or per-message chunking variants. Per-turn is the chosen granularity; revisit only if recall still misses.
- A vector index on `embedding` (HNSW etc.). Cosine scan stays linear; the chunk-row limit is the latency gate.
- Lexical-side chunking. Whole-trace document stays the lexical unit.
- Reranking with a cross-encoder. Single-vector cosine ranking after max-pool is the floor; reranking is a separate axis.

## Design

### Chunking

A "turn" = one user message and the assistant message that immediately follows it, plus any tool-call/tool-response pairs in between. The boundary is the next user message. The very first assistant message in a trace (if it precedes any user input) is its own chunk.

```ts
// packages/domain/spans/src/use-cases/build-trace-search-document.ts
export interface TraceSearchChunk {
  readonly chunkIndex: number      // 0-based, contiguous
  readonly text: string            // chunk-local text the embedder sees
  readonly contentHash: string     // hash(traceId + "\0" + chunkIndex + "\0" + text)
}

export interface TraceSearchDocument {
  readonly traceId: string
  readonly startTime: Date
  readonly rootSpanName: string
  readonly searchText: string                   // whole-trace lexical document, unchanged
  readonly contentHash: string                  // whole-trace hash, unchanged
  readonly chunks: readonly TraceSearchChunk[]  // NEW: one or more
}
```

Total embedded text per trace stays approximately bounded by `TRACE_SEARCH_DOCUMENT_MAX_LENGTH` (20k chars, ~5k tokens) — same Voyage spend per trace as today, just split across more vectors. The cap is a *soft* threshold applied turn-by-turn: a turn is the atomic embedding unit, so once we start embedding a turn we finish it, even if the running total slightly overshoots.

When a trace exceeds the budget, we mirror the head+tail middle-elision the lexical document already uses, but with the budget tilted toward the tail. The tail is more important for retrieval — it's where the agent's outcome lives (resolution, handoff, error, final answer), and that's what users most often search for. The opening of the conversation matters too (the user's framing of the question) but carries less retrieval signal than the conclusion, so it gets the smaller share. The dropped middle is whatever sits between.

Constants:

- `TRACE_SEARCH_DOCUMENT_MAX_LENGTH = 20_000` chars — **unchanged**. The lexical document still uses this as a hard cap; chunking uses it as the trigger for splitting into head + tail.
- `TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS = 12_000` — soft cap for the backward walk. The bigger half because the tail carries more retrieval signal than the head.
- `TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS = 8_000` — soft cap for the forward walk.
- `TRACE_SEARCH_CHUNK_MAX_CHARS = 2_000` (~500 tokens) — per-chunk soft cap. Long single turns split into multiple chunks at this size.
- `TRACE_SEARCH_CHUNK_OVERLAP_CHARS = 200` (~50 tokens) — overlap used only when splitting a single turn that exceeds the per-chunk cap.
- `TRACE_SEARCH_EMBEDDING_MIN_LENGTH = 100` chars — **unchanged**. Continues to apply per-chunk; chunks below the floor are skipped.

Algorithm:

1. Extract turns (user → assistant + interleaved tool calls), as today.
2. Compute total conversation size. If `total <= TRACE_SEARCH_DOCUMENT_MAX_LENGTH`, walk forward and embed every turn — no head/tail split needed.
3. Otherwise, do two soft-capped walks, **tail first**:
   - **Tail walk** (backward from the last turn): include each turn as long as `accumulated_tail < TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS` *before* starting it. The turn that first crosses the threshold is still embedded fully (atomic-turn rule); earlier turns are then skipped.
   - **Head walk** (forward from turn 0): include each turn as long as `accumulated_head < TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS` *before* starting it, again with atomic-turn overshoot. Stop early if the walk would revisit a turn the tail walk already claimed.
4. **Head guarantee**: if the tail walk consumed every turn (e.g. via atomic-turn overshoot) and the head walk ended up with zero turns, force-include turn 0 in the head and remove it from the tail set. This way the opening of the conversation is never fully dropped.
5. Concatenate `head_turns ++ tail_turns` in original conversation order, with the dropped middle replaced by nothing (no marker — chunks are independent vectors and overlap markers between non-adjacent turns would just confuse retrieval).
6. Pack the resulting turn list into chunks: open a new chunk; append turns until appending the next would push the chunk past `TRACE_SEARCH_CHUNK_MAX_CHARS`; close and start a new chunk.
7. A single turn larger than the per-chunk cap splits into N pieces with `TRACE_SEARCH_CHUNK_OVERLAP_CHARS` overlap so a cross-boundary phrase still embeds inside one chunk.

Concretely:
- 50 short turns of 100 chars (5k chars total) → walk all turns (under cap). ~3 chunks of 5–10 turns each.
- 4 long turns of 4k chars each (16k chars total) → walk all turns (under cap). 4 chunks (one per turn).
- 30 turns of 1k chars each (30k chars total) → over cap → tail walk takes turns 19–30 (12k), head walk takes turns 1–8 (8k), turns 9–18 dropped. ~10 chunks.
- Tail walk has 11.5k accumulated, next turn (going backward) is 2k → embed it fully (total 13.5k tail). Earlier turns won't start because we're now past `TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS`.
- A trace where the very last turn is 30k chars → tail walk includes that single turn fully (atomic-turn overshoot to 30k), tail walk then stops. Head walk runs normally up to 8k. Total ~38k. Worst-case overshoot is the size of one boundary turn; a single pathological turn can blow the budget by a few-x. Acceptable in exchange for not slicing within a turn.
- A trace where the tail walk somehow consumed every turn → head guarantee force-includes turn 0 in the head walk, so the opening always survives.

The `searchText` field on the document stays exactly as today — whole-trace lexical text with the existing 20k-char head+tail middle-truncation. Lexical search is unaffected by the chunking changes.

### Storage migration

ClickHouse rejects `MODIFY ORDER BY` that references a pre-existing column, so we can't extend the PK in place. Instead:

```sql
-- packages/platform/db-clickhouse/clickhouse/migrations/clustered/00013_trace_search_embeddings_chunked.sql

-- 1. Build the new shape under a temporary name.
CREATE TABLE IF NOT EXISTS trace_search_embeddings_chunked ON CLUSTER default
(
    organization_id    LowCardinality(String)             CODEC(ZSTD(1)),
    project_id         LowCardinality(String)             CODEC(ZSTD(1)),
    trace_id           FixedString(32)                    CODEC(ZSTD(1)),
    chunk_index        UInt16                             CODEC(T64, ZSTD(1)),
    start_time         DateTime64(9, 'UTC')               CODEC(Delta(8), ZSTD(1)),
    content_hash       FixedString(64)                    CODEC(ZSTD(1)),
    embedding_model    LowCardinality(String)             CODEC(ZSTD(1)),
    embedding          Array(Float32)                     CODEC(ZSTD(1)),
    indexed_at         DateTime64(3, 'UTC') DEFAULT now64(3) CODEC(Delta(8), LZ4),
    retention_days     UInt16 DEFAULT 30                  CODEC(T64, ZSTD(1))
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, trace_id, chunk_index)
ORDER BY (organization_id, project_id, trace_id, chunk_index)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- 2. Atomic swap. Original name now points to the empty new shape; old data
--    sits in `_legacy`, still queryable but no longer written to.
RENAME TABLE
    trace_search_embeddings        TO trace_search_embeddings_legacy,
    trace_search_embeddings_chunked TO trace_search_embeddings
ON CLUSTER default;
```

`EXCHANGE TABLES … AND … ON CLUSTER default` would be a more atomic primitive but `RENAME … TO … , … TO … ON CLUSTER default` is enough here — readers and writers go through the same name and pick up the new shape after the migration completes.

A follow-up migration drops `trace_search_embeddings_legacy` once one full TTL window has elapsed (i.e. all rows have aged out anyway). No urgency; it's just a cleanup.

The `unclustered` mirror does the same RENAME without `ON CLUSTER`.

### Worker

`apps/workers/src/workers/trace-search.ts:processRefreshTrace` after this spec:

1. Load the conversation as today.
2. `buildTraceSearchDocument` returns whole-trace `searchText` *and* per-turn `chunks`.
3. Upsert the lexical document (unchanged).
4. For each chunk where `text.length >= TRACE_SEARCH_EMBEDDING_MIN_LENGTH`:
   - `hasEmbeddingWithHashAndChunk(org, project, trace, chunkIndex, contentHash)` — skip if the same chunk content was already embedded.
   - `tryConsume(estimatedTokens)` against `TraceSearchBudget` — skip the rest of the chunks for this trace if the budget is exhausted (we don't partially index a trace).
   - Embed via Voyage with `inputType: "document"`.
   - `upsertEmbedding({ traceId, chunkIndex, contentHash, embedding, ... })`.
5. Delete any leftover chunk rows whose `chunk_index >= newChunks.length` (handles a trace that shrank since its previous indexing). One `ALTER TABLE ... DELETE WHERE` per trace is overkill; instead we let `ReplacingMergeTree` collapse via `indexed_at` for indexes that were re-written, and accept that purely-removed-tail chunks linger until TTL. They don't surface in queries because they share the same trace_id and the `max()` rollup picks the best, but they do consume storage briefly. Acceptable.

`TraceSearchRepository` ports gain a `chunkIndex` parameter on `upsertEmbedding` and `hasEmbeddingWithHash` (renamed to `hasEmbeddingWithHashAndChunk` for clarity).

### Repository read

`buildSemanticSearchSubquery` after this spec:

```sql
SELECT
    CAST(trace_id AS String) AS trace_id,
    max(1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS semantic_score
FROM trace_search_embeddings
WHERE organization_id = {organizationId:String}
  AND project_id      = {projectId:String}
GROUP BY trace_id
ORDER BY semantic_score DESC
LIMIT {semanticScanLimit:UInt32}
```

`SEMANTIC_SCAN_LIMIT` becomes the chunk-row limit. Bump from `10_000` to `30_000` to leave headroom for the average ~3-chunk-per-trace ratio on real workloads. The `LIMIT` runs *after* the `GROUP BY` so it caps trace count not chunk count — fine, since the cosine scan still happens on the full (filtered) chunk set inside the GROUP BY.

The hybrid LEFT JOIN structure (`buildSearchPlan`'s `hasPhrases && hasSemantic` case) keeps working unchanged: the lexical CTE provides candidate trace_ids, the semantic CTE now returns per-trace rolled-up scores, and the LEFT JOIN handles missing-embedding cases the same way as today.

`TRACE_SEARCH_MIN_RELEVANCE_SCORE` interpretation changes slightly: the floor now applies to the best-chunk score, not a single whole-trace score. Empirically, max-pooled per-chunk cosines run higher than today's whole-trace cosines for true matches (chunks are more focused → tighter alignment), so the existing `0.2` floor probably needs nudging up. Tune empirically against the LAT-562 repro project after backfill.

### Backfill

`pnpm --filter @app/workers trace-search:backfill` already iterates every trace and calls `runTraceSearchRefresh`. After this spec, the worker chunks → backfill produces chunked rows automatically. No new script. Run it once after the migration lands; existing rows in `trace_search_embeddings` (now empty post-rename) get re-populated as chunks.

Cost note: re-embedding the full corpus costs Voyage tokens proportional to total trace text — same total tokens as the original embedding pass, just split across more API calls.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Schema rebuild

- [ ] **P1-1**: Author migration `00013_trace_search_embeddings_chunked.sql` via `pnpm --filter @platform/db-clickhouse ch:create trace_search_embeddings_chunked`. Create the new table, then RENAME-swap. Verify locally via `SHOW CREATE TABLE` that the live name has the new PK and the legacy name retains the old rows.
- [ ] **P1-2**: Update `packages/platform/testkit/src/clickhouse/schema.sql` to reflect the new shape (chdb test backend doesn't run migrations).

**Exit gate**: `pnpm --filter @platform/db-clickhouse ch:up` succeeds; `trace_search_embeddings` has `chunk_index` in PK; `trace_search_embeddings_legacy` exists and holds the pre-migration rows.

### Phase 2 — Chunking in the document builder

- [ ] **P2-1**: Add `TraceSearchChunk` to `@domain/spans` exports. Add `TRACE_SEARCH_CHUNK_MAX_CHARS`, `TRACE_SEARCH_CHUNK_OVERLAP_CHARS`, `TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS`, `TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS` constants.
- [ ] **P2-2**: Implement chunking in `buildTraceSearchDocument`. If the conversation fits the per-trace budget, walk forward and pack into chunks. Otherwise do soft-capped head + tail walks, drop the middle, then pack. Long single turns split with overlap. Per-chunk content hash.
- [ ] **P2-3**: Tests for the chunker: short trace (no head/tail split), many small turns (greedy multi-turn packing), oversize single turn (split with overlap), long trace (tail-first walks with middle dropped), tail and head walks meeting in the middle (no overlap or duplication), atomic-turn overshoot at the tail boundary, head guarantee (tail consumed every turn → turn 0 still embedded in head), interleaved tool calls.

**Exit gate**: `pnpm --filter @domain/spans test build-trace-search-document` passes. Chunk content hashes are stable across runs for identical input.

### Phase 3 — Worker + repository ports

- [ ] **P3-1**: Update `TraceSearchRepository` port: `upsertEmbedding` takes `chunkIndex`, `hasEmbeddingWithHash` becomes `hasEmbeddingWithHashAndChunk` (or accept the chunk_index parameter on the existing name).
- [ ] **P3-2**: Update `TraceSearchRepositoryLive` queries for the new PK.
- [ ] **P3-3**: Rewrite `processRefreshTrace` to iterate chunks, gate each on per-chunk hash + budget, embed with `inputType: "document"`, upsert per-chunk rows. The whole-trace lexical upsert stays untouched.
- [ ] **P3-4**: Update fakes in `@domain/spans/testing/fake-trace-search-repository` (if it exists) and any worker tests.

**Exit gate**: `pnpm --filter @app/workers test` passes. Running `processRefreshTrace` against a fixture trace produces N chunk rows with consecutive `chunk_index` values starting at 0.

### Phase 4 — Repository read path

- [ ] **P4-1**: Rewrite `buildSemanticSearchSubquery` in `trace-repository.ts` to add `max(...) GROUP BY trace_id` rollup. Bump `SEMANTIC_SCAN_LIMIT` to `30_000`.
- [ ] **P4-2**: Add a per-trace-shape integration test covering: a trace that matches in chunk 5 only ranks above a trace that matches weakly in every chunk. Verify the LAT-562 phrase-only path is unaffected (no chunks queried at all).

**Exit gate**: `pnpm --filter @platform/db-clickhouse test trace-repository` passes. Existing four-shape tests still pass; new chunked-rollup test passes.

### Phase 5 — Backfill + tuning

- [ ] **P5-1**: Run `pnpm --filter @app/workers trace-search:backfill` against the local seeded corpus. Spot-check the chunk count distribution (should cluster around the average turn count per trace).
- [ ] **P5-2**: Re-tune `TRACE_SEARCH_MIN_RELEVANCE_SCORE` against the LAT-562 repro queries. Default `0.2` is the working assumption; bump if max-pooled scores systematically run higher than today's.

**Exit gate**: backfill completes without errors; LAT-562 sample queries return the expected traces with semantic ranking that outperforms the whole-trace baseline (eyeball check).

### Phase 6 — Legacy cleanup

- [ ] **P6-1**: After one full embedding TTL window in production (30 days), author a migration that `DROP TABLE trace_search_embeddings_legacy`. Separate PR; nothing in this spec depends on it.

## Open Items

- Whether the per-chunk cap of 2k chars (~500 tokens) is the right balance between in-chunk context and per-trace chunk count. Decide after observing the chunk-count histogram on real production traffic.
- Whether to expose chunk_index in retrieval responses so the UI can scroll the trace detail drawer to the matching turn. Out of scope here; logged for later.
- Whether to add an HNSW or USearch vector index on `embedding` once the chunk row count crosses ~100k per project. Linear scan is fine until then.
