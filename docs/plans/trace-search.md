# Trace Search

> **Current-state documentation**: [`docs/trace-search.md`](../trace-search.md).
> **Related**: `docs/spans.md`, `docs/filters.md`.
>
> This document is the original plan. Phases 1–4 were executed as written, but the
> design evolved substantially afterward — see [Post-Implementation Evolution](#post-implementation-evolution)
> at the end for the diffs (semantic cap removed, rerank added then removed,
> embedding model upgraded, query path simplified). The feature doc above is the
> source of truth for what's actually running.

Implement forward-only trace search on top of ClickHouse. Search should cover trace input/output message content with two retrieval modes:

- lexical text inclusion
- semantic similarity over embeddings

This plan intentionally excludes:

- session search
- any historical backfill
- indexing or searching system prompts
- introducing a new database for search

The production target is ClickHouse `25.2`, so lexical search must use `tokenbf_v1` and `ngrambf_v1` rather than `TYPE text`, which starts in `26.2+`.

## Accepted Decisions

- Search is **trace-only**.
- Search is a separate `searchQuery` input, not part of `FilterSet`.
- Search indexes are **forward-only**: only traces indexed after rollout become searchable.
- Search documents must include only trace **input/output message content** plus small trace metadata when useful.
- Search documents must **exclude `system_instructions` / system prompts** entirely.
- When `searchQuery` is present, the default ordering is **`relevance`**.
- Lexical search can cover all newly indexed traces.
- Semantic search is limited to a recent per-project cap for newly indexed traces.

## Search Model

### Indexed document

Each searchable trace produces one canonical document built from:

- user input messages
- assistant output messages
- optional tool input/output content if it materially improves search quality
- root span name as a lightweight metadata boost

The document must not include:

- system prompt text
- system instructions
- unrelated span metadata maps

The document text is normalized and truncated by named constants before:

- lexical storage in ClickHouse
- embedding generation

### Forward-only rollout semantics

There is no migration job, backfill, or historical replay.

The search corpus begins empty at rollout and fills only when new traces complete the normal post-ingest debounce flow and the new indexing task runs successfully.

### Lexical retrieval

Lexical search reads from a dedicated ClickHouse table containing one normalized search document per trace. Query predicates should support:

- token/word lookup
- substring inclusion

### Semantic retrieval

Semantic search reads from a dedicated ClickHouse table containing one embedding per trace for traces that fall within the recent per-project semantic cap.

Search query embedding is generated at request time and compared in ClickHouse with cosine distance.

### Hybrid ranking

Search results come from the union of:

- lexical candidates
- semantic candidates

The ClickHouse repository computes a combined `relevance` score and uses that ordering whenever `searchQuery` is present.

## Storage Design

### `trace_search_documents`

One row per indexed trace.

Required columns:

- `organization_id`
- `project_id`
- `trace_id`
- `start_time`
- `root_span_name`
- `search_text`
- `content_hash`
- `indexed_at`

Engine guidance:

- `ReplacingMergeTree(indexed_at)`
- key by `(organization_id, project_id, trace_id)`

Lexical indexes:

- `tokenbf_v1` on normalized text for token lookup
- `ngrambf_v1` on normalized text for substring inclusion

### `trace_search_embeddings`

One row per semantically indexed trace.

Required columns:

- `organization_id`
- `project_id`
- `trace_id`
- `start_time`
- `content_hash`
- `embedding_model`
- `embedding`
- `indexed_at`

Engine guidance:

- `ReplacingMergeTree(indexed_at)`
- key by `(organization_id, project_id, trace_id)`

## Runtime Design

### Indexing trigger

Search indexing should not happen during raw span ingestion.

Instead, after successful `trace-end:run`, publish a dedicated async task such as `trace-search:refreshTrace`. This keeps indexing attached to the existing debounced “trace settled” boundary.

### Indexing worker responsibilities

For each refresh task:

1. load the full trace conversation from ClickHouse
2. build the canonical search document excluding system prompts
3. compute a deterministic `content_hash`
4. upsert the lexical row into `trace_search_documents`
5. decide whether the trace is eligible for semantic indexing under the recent per-project cap
6. if eligible and changed, generate an embedding and upsert `trace_search_embeddings`
7. if not eligible, leave the trace lexical-only

### Semantic cap policy

V1 should use a simple project-scoped recent-trace cap, for example the latest `N` indexed traces per project.

This policy should be implemented with named constants and should not attempt to sweep or backfill older traces.

## Query Path Design

### UI and server contracts

Add `searchQuery` to the trace listing path only.

Thread it through:

- `apps/web` route state for the traces page
- trace React Query collections
- trace server functions
- `TraceRepository` port
- ClickHouse trace repository implementation

`FilterSet` remains unchanged and continues to constrain the result set alongside search.

### Trace repository behavior with active search

When `searchQuery` is present:

1. build a lexical candidate subquery from `trace_search_documents`
2. build a semantic candidate subquery from `trace_search_embeddings`
3. union candidates by `trace_id`
4. compute a hybrid `relevance` score
5. join candidate trace ids into the existing `traces` query pipeline
6. order by `relevance`

When `searchQuery` is absent, keep current trace query behavior unchanged.

### Metrics and histogram behavior

Trace count, metrics, and histogram queries should use the same search-constrained candidate set so the page remains internally consistent while search is active.

## Phases

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Search Storage And Async Indexing Foundation

- [x] **P1-1**: Add ClickHouse migrations for `trace_search_documents` in both `unclustered/` and `clustered/` migration trees.
- [x] **P1-2**: Add ClickHouse migrations for `trace_search_embeddings` in both `unclustered/` and `clustered/` migration trees.
- [x] **P1-3**: Add a new queue topic/task contract for trace search refresh work.
- [x] **P1-4**: Publish the trace search refresh task from `apps/workers/src/workers/trace-end.ts` only after successful trace-end completion.
- [x] **P1-5**: Implement a document builder that loads full trace input/output messages and excludes `system_instructions` completely.
- [x] **P1-6**: Add named constants for document truncation, semantic eligibility, and recent per-project embedding cap.
- [x] **P1-7**: Implement a worker that upserts lexical rows and conditionally upserts embedding rows using `content_hash` to skip redundant embedding work.

**Exit gate**:

- [x] newly completed traces enqueue search refresh work
- [x] lexical rows are written for new traces only
- [x] semantic rows are written only for eligible new traces
- [x] no system prompt text is persisted into either search table

### Phase 2 - Lexical Search Query Path

- [x] **P2-1**: Add `searchQuery` to the traces page URL state and data-fetching hooks.
- [x] **P2-2**: Extend trace server functions to accept and forward `searchQuery`.
- [x] **P2-3**: Extend the `TraceRepository` port so trace list/count/metrics/histogram methods accept search input.
- [x] **P2-4**: Implement lexical candidate subqueries in the ClickHouse trace repository using `trace_search_documents`.
- [x] **P2-5**: Apply lexical search constraints to trace list, count, metrics, and histogram queries.
- [x] **P2-6**: Add `relevance` ordering behavior when `searchQuery` is present, with lexical-only scoring at this stage.

**Exit gate**:

- users can search newly indexed traces lexically
- search affects trace list and supporting aggregate panels consistently
- active search orders traces by lexical relevance

### Phase 3 - Semantic Search And Hybrid Relevance

- [x] **P3-1**: Implement query-time embedding for trace search requests using the shared AI embedding stack and cache.
- [x] **P3-2**: Implement semantic candidate retrieval from `trace_search_embeddings` with cosine distance in ClickHouse.
- [x] **P3-3**: Merge lexical and semantic candidates into one hybrid candidate set by `trace_id`.
- [x] **P3-4**: Compute a hybrid `relevance` score and make it the default ordering for active search.
- [x] **P3-5**: Ensure traces without embeddings remain eligible for lexical-only search without dropping from results.

**Exit gate**:

- [x] search returns hybrid lexical + semantic matches for newly indexed traces
- [x] traces outside the semantic cap still participate in lexical search
- [x] active search orders traces by hybrid relevance

### Phase 4 - Hardening, Tests, And Rollout Safety

- [x] **P4-1**: Add ClickHouse repository tests for lexical matching, substring matching, semantic matching, and hybrid relevance ordering.
- [x] **P4-2**: Add worker tests for trace-end publication, document building, prompt exclusion, and `content_hash` skip behavior.
- [x] **P4-3**: Add integration coverage for search-aware count, metrics, and histogram queries.
- [x] **P4-4**: Add logging/observability around indexing throughput, semantic cap skips, and query candidate counts.
- [x] **P4-5**: Verify rollout semantics are strictly forward-only and that no code path attempts historical backfill.

**Exit gate**:

- [x] all major search paths are covered by automated tests
- [x] indexing and query behavior are observable in production
- [x] rollout is confirmed forward-only for both lexical and semantic search

## Notes For Later

- After production upgrades to ClickHouse `26.2+`, lexical indexing can be re-evaluated for migration from bloom-filter-based search acceleration to `TYPE text` without changing the product surface.
- Session search can be reconsidered later, but it should be designed separately rather than implicitly coupling session results to trace search in this phase.

## Post-Implementation Evolution

After the four planned phases shipped, the feature went through several rounds of
iteration driven by real query-quality testing and cost analysis. This section
documents what changed and why. For current-state architecture, always refer to
[`docs/trace-search.md`](../trace-search.md).

### 1. Per-project semantic cap → TTL-only retention

**Planned:** latest N traces per project eligible for semantic indexing
(`TRACE_SEARCH_SEMANTIC_CAP = 10_000`). Beyond the cap, traces stayed
lexical-only.

**Now:** no per-project cap. All eligible traces get embedded on arrival.
Retention is enforced purely by ClickHouse `TTL` — 30 days on embeddings,
90 days on documents.

**Why:**
- Cost analysis showed indexing at any realistic scale is trivial
  (~$5–50/month depending on company size). The cap was solving a non-problem.
- The cap introduced code surface (cleanup worker, periodic sweep, eligibility
  check) without providing value. Each trace in the per-project window now
  gets embedded; TTL handles eviction cleanly.
- Per-tenant tier knobs (which were one justification for the cap) are better
  implemented via model/dimension/TopK per plan, not embedding row caps.

**Code deletions:**
- `TRACE_SEARCH_EMBEDDING_CAP_PER_PROJECT` constant
- `TRACE_SEARCH_CLEANUP_INTERVAL_MS` constant
- `TraceSearchRepository.pruneExcessEmbeddings` method
- `apps/workers/src/workers/trace-search-cleanup.ts` (entire file)
- Cleanup scheduler wiring in `apps/workers/src/server.ts`

### 2. Size floor added to indexing

**Added:** `TRACE_SEARCH_EMBEDDING_MIN_LENGTH = 100`. Traces whose
`search_text` is shorter than this aren't semantically embedded. They still
get lexical documents.

**Why:** short traces (single-turn classifier prompts, "hi", etc.) embed into
uninformative vectors that cluster at similar distances from every query.
Skipping them removes retrieval noise and trims Voyage spend on content that
adds no signal.

### 3. Cross-encoder rerank added, then removed

This was the biggest zigzag in the project.

**Added:** a two-phase query pipeline — hybrid candidates (top-100 by combined
score) fetched from CH, then reranked by `voyage-rerank-2.5`. The reranker was
the "precision filter" and let us loosen the pre-rerank relevance floor to
near zero.

**Motivation at the time:** `voyage-3-lite` cosine scores for paraphrase
queries ("user complaining") clustered too close between real matches and
noise (classifier prompts literally containing the word "complaint"). Cross-
encoders look at `(query, doc)` jointly and sidestep that bi-encoder
limitation.

**Why it was removed:**
- The 100-document rerank input cap is a hard ceiling on total search results.
  You can't paginate past 100 because rerank scores aren't stable across
  independent API calls (reranking docs 1–100 then 101–200 gives
  differently-calibrated scores).
- Users expect search to behave like any filter column — infinite scroll,
  stable ordering, composable with `sortBy` and filters. Rerank breaks that
  mental model.
- Upgrading the embedding model (see next section) made rerank's precision win
  marginal. Voyage-4-large alone cleanly separates real complaints from
  classifier noise in the top-30, with no need for a cross-encoder to break ties.
- Cost per search dropped ~100× by removing rerank. Latency dropped ~200ms.

**Code deletions:**
- `TRACE_SEARCH_RERANK_MODEL`, `TRACE_SEARCH_RERANK_TOP_K`,
  `TRACE_SEARCH_RERANK_MIN_RELEVANCE` constants
- `HYBRID_SEARCH_CONFIG.semanticTopK`
- Two-phase list query pipeline (candidates fetch → Voyage rerank → metadata fetch)
- `AIRerankLive` wiring in `traces.functions.ts`

### 4. Embedding model upgraded: voyage-3-lite → voyage-4-large

**Before:** `voyage-3-lite` / 512 dimensions / $0.02 per 1M tokens.
**After:** `voyage-4-large` / 2048 dimensions / $0.12 per 1M tokens.

**Why:**
- Voyage-4 generation includes a 200M-free-tokens/month tier that makes
  Small/Medium companies effectively free.
- Voyage-4-large produces cleaner cosine rankings on paraphrase queries —
  closing enough of the bi-encoder/cross-encoder gap that rerank became
  removable.
- 4× storage per row (8 KB vs 2 KB) is still trivial at realistic scales
  (< 20 GB for an Extra-Large customer).

**Cost implications:**
- Small / Medium: **$0/month** (within free tier).
- Large (500k traces/month): **~$7.50/month** indexing.
- Extra Large (5M traces/month): **~$291/month** — the one scale where costs
  increased relative to the previous voyage-3-lite + rerank setup. Mitigations:
  downgrade to voyage-4 (1024d, 3× cheaper) or use voyage-4-large at 1024d
  via Matryoshka for same cost with half the storage/scan time.

### 5. Query path simplified to a single CH query

**Before (during rerank era):** two CH queries + one Voyage rerank API call
per list view. Results capped at 100 in any ordering.

**Now:** one CH query. The hybrid candidate subquery is embedded as an
`INNER JOIN search_results` against the main `traces` query, with cursor-
based pagination on `(relevance_score, trace_id)` matching the shape of the
non-search pagination path. Composable with filters, infinite scrollable, no
hidden row cap.

**Relevance scoring** remains `0.3 * lexical + 0.7 * semantic`, gated by
`TRACE_SEARCH_MIN_RELEVANCE_SCORE = 0.2`. The threshold was retuned for
voyage-4-large's cosine distribution (lower absolute values than voyage-3-lite
for equivalently-strong matches).

### 6. Document builder refinements

Two material changes to `buildTraceSearchDocument`:

- **Tool result placeholder removed.** The literal string `[TOOL RESULT]` used
  to appear in every indexed document with tool calls. Tool result payloads
  themselves were never indexed (correctly — they're JSON blobs, not
  searchable content), but the placeholder added noise to embeddings without
  retrieval value. Now emits empty string.
- **Unknown part types skipped.** Previously emitted `[<part-type>]` labels
  for parts we hadn't modeled; now emits empty string. Same rationale —
  untyped tokens feed arbitrary noise into embeddings.

### 7. Asymmetric embedding `input_type`

Fixed a silent quality bug: the Voyage embed adapter was hardcoded to
`inputType: "document"` for every call. Voyage models produce *asymmetric*
embeddings — indexing should use `"document"` but querying should use
`"query"`. Using `"document"` for query side degraded retrieval quality by
~15% in testing. The `EmbedInput` interface now carries `inputType?` and the
trace-search query path sets it to `"query"`.

### 8. Aggregate consistency

Under the rerank era, `count`, `metrics`, and `histogram` used the unfiltered
hybrid subquery while the list showed the reranked-and-filtered top-N. This
produced visible drift — count would say "3,247 results" above a list of 10
items. With rerank removed, all four queries share the same `HAVING
relevance_score >= floor` gate, so numbers agree again.

### Summary of deleted concepts

These terms appear in the original plan but no longer describe the system:

- "semantic cap" / `TRACE_SEARCH_SEMANTIC_CAP`
- "per-project eligibility" (now everything indexed ⇒ embedded ⇒ TTL'd)
- "rerank" / "cross-encoder" / `TRACE_SEARCH_RERANK_*`
- "semantic top-K candidates" as a bound on results
- "two-phase query pipeline"

For what *does* describe the system today, see
[`docs/trace-search.md`](../trace-search.md).
