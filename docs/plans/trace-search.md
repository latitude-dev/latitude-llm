# Trace Search

> **Documentation**: `docs/spans.md`, `docs/filters.md`

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

- [ ] **P2-1**: Add `searchQuery` to the traces page URL state and data-fetching hooks.
- [ ] **P2-2**: Extend trace server functions to accept and forward `searchQuery`.
- [ ] **P2-3**: Extend the `TraceRepository` port so trace list/count/metrics/histogram methods accept search input.
- [ ] **P2-4**: Implement lexical candidate subqueries in the ClickHouse trace repository using `trace_search_documents`.
- [ ] **P2-5**: Apply lexical search constraints to trace list, count, metrics, and histogram queries.
- [ ] **P2-6**: Add `relevance` ordering behavior when `searchQuery` is present, with lexical-only scoring at this stage.

**Exit gate**:

- users can search newly indexed traces lexically
- search affects trace list and supporting aggregate panels consistently
- active search orders traces by lexical relevance

### Phase 3 - Semantic Search And Hybrid Relevance

- [ ] **P3-1**: Implement query-time embedding for trace search requests using the shared AI embedding stack and cache.
- [ ] **P3-2**: Implement semantic candidate retrieval from `trace_search_embeddings` with cosine distance in ClickHouse.
- [ ] **P3-3**: Merge lexical and semantic candidates into one hybrid candidate set by `trace_id`.
- [ ] **P3-4**: Compute a hybrid `relevance` score and make it the default ordering for active search.
- [ ] **P3-5**: Ensure traces without embeddings remain eligible for lexical-only search without dropping from results.

**Exit gate**:

- search returns hybrid lexical + semantic matches for newly indexed traces
- traces outside the semantic cap still participate in lexical search
- active search orders traces by hybrid relevance

### Phase 4 - Hardening, Tests, And Rollout Safety

- [ ] **P4-1**: Add ClickHouse repository tests for lexical matching, substring matching, semantic matching, and hybrid relevance ordering.
- [ ] **P4-2**: Add worker tests for trace-end publication, document building, prompt exclusion, and `content_hash` skip behavior.
- [ ] **P4-3**: Add integration coverage for search-aware count, metrics, and histogram queries.
- [ ] **P4-4**: Add logging/observability around indexing throughput, semantic cap skips, and query candidate counts.
- [ ] **P4-5**: Verify rollout semantics are strictly forward-only and that no code path attempts historical backfill.

**Exit gate**:

- all major search paths are covered by automated tests
- indexing and query behavior are observable in production
- rollout is confirmed forward-only for both lexical and semantic search

## Notes For Later

- After production upgrades to ClickHouse `26.2+`, lexical indexing can be re-evaluated for migration from bloom-filter-based search acceleration to `TYPE text` without changing the product surface.
- Session search can be reconsidered later, but it should be designed separately rather than implicitly coupling session results to trace search in this phase.
