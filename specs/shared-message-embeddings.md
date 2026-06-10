# Shared message embeddings

> **Documentation**: `dev-docs/spans.md`, `dev-docs/conversation-intelligence.md`, `dev-docs/taxonomy.md`

## Context

Two pipelines embed the same conversation text with the same model (`voyage-4-large`, 2048 dims) in different packaging:

- **Trace search** (`apps/workers/src/workers/trace-search.ts`) groups a trace's messages into turns, packs turns into ~2,000-char chunks (head+tail truncation at 20,000 chars per trace), embeds each chunk, and stores one row per chunk per trace in `trace_search_embeddings`.
- **Conversation intelligence** (`packages/domain/conversation-intelligence/src/use-cases/analyze-session.ts`) embeds each non-tool message of the session conversation individually (`"{role}: {text}"`, `inputType: "document"`) to drive semantic segmentation, anchor-based moment labeling, and taxonomy projections.

This duplicates embedding work along three axes:

1. **Within trace search, across traces in a session.** Trace N's input messages replay the whole prior conversation, and the dedup check in `trace-search-repository.ts` is keyed by `(org, project, trace_id, chunk_index, content_hash)`. It only prevents re-embedding the same chunk of the same trace on retry. Chunk boundaries are trace-relative and shift as history grows, so a 20-trace session re-embeds its shared history up to 20 times (capped per trace by head+tail).
2. **Within conversation intelligence, across re-analyses.** `embedTurns` re-embeds every turn on each debounced analysis pass of a growing session; the `analysisHash` short-circuit only fires when the session is fully unchanged. Anchor texts (static constants per detector version) are also re-embedded on every pass.
3. **Across the two pipelines.** The same message text is embedded once as part of a search chunk and again as a CI turn.

Mid-session **compaction** (the customer's agent replaces conversation history with a summary, so trace 5's input is not a superset of trace 4's) rules out any prefix-based dedup scheme and makes the current CI session reconstruction (system from earliest trace, input from first, output from latest) silently misrepresent compacted sessions.

The fix is not to migrate one product onto the other's unit. Chunks are too coarse for segmentation and drop the middle of long traces; moment centroids dilute needles and would force a rethink of trace-anchored surfaces like datasets. Instead, factor out the unit both pipelines already share, the **message**, into a content-addressed embedding store, and derive both products from it.

## Goals

- Embed each distinct message text once per `(org, project)`, regardless of how many traces replay it, how many analysis passes a session goes through, or which pipeline needs it first.
- Keep trace-level search, datasets, highlights, and the lexical index untouched as product surfaces.
- Keep every CI tuned threshold (continuity clamps, anchor thresholds/margins, confidence floors) valid by preserving CI's canonical embedding format.
- Make session analysis robust to mid-session compaction.
- Reduce the vector scan size of semantic search (distinct messages instead of per-trace-duplicated chunks) and remove the head+tail truncation blind spot for long traces.

## Decisions

- **The shared unit is the message, not the exchange.** CI's atomic unit is a single non-tool message; trace search adapts its ranking unit, not the other way around, because CI's thresholds are empirically tuned and search's relevance floor needs re-tuning under any change.
- **Canonical embedded text is CI's format**: `"{role}: {text}"`, `inputType: "document"`, model `voyage-4-large`, 2048 dims. The content hash is computed over this canonical string.
- **Vectors are trace-agnostic.** `message_embeddings` rows carry no trace identity. Trace linkage lives exclusively in `trace_message_occurrences`, written exclusively by the trace-end search worker (the only writer that knows message positions within a trace).
- **Both consumers embed-on-miss with write-through.** Whoever needs a vector first creates it; the other gets a hash hit. Workers can race in any order. A CI-written vector with no occurrence row is inert: search enters through occurrences, so orphan vectors can never produce phantom results.
- **One shared canonicalize + hash function** lives in `@domain/spans` and is the only way either pipeline computes a message hash. This is the load-bearing invariant of the design: if the two writers canonicalize differently, every lookup misses and the system silently degrades to double-embedding (correct but expensive). A test must feed the same span through both pipelines and assert hash equality.
- **v1 embeds the whole canonical message** (no sub-message chunking). This matches CI exactly. For search, very long messages lose some needle recall versus today's 2k-char chunks; accepted for v1, with sub-message chunking (`(content_hash, chunk_index)` rows) as a follow-up if recall regresses on long messages. Provider-side token-cap truncation applies to oversized messages.
- **Retention splits by table.** Occurrence rows TTL with trace search retention (plan-resolved, default 30 days). Vector rows TTL off `last_seen_at` (refreshed on insert via `ReplacingMergeTree` semantics) at the max retention across consumers: 90 days (CI). A vector outliving its occurrences is harmless dead weight; an occurrence outliving its vector falls out of the search join silently. Both failure directions degrade to "absent from results", never to wrong results.
- **The existing org-level embedding budget** (rolling daily/weekly/monthly windows) applies to both writers; budget consumption happens at embed time regardless of which pipeline triggered it.
- **The lexical index (`trace_search_documents`) is out of scope** and unchanged.
- **`trace_search_embeddings` is deprecated after search cutover**: stop writing, let TTL drain it, drop via a follow-up append-only migration.

## Architecture

### Data model (ClickHouse)

```text
message_embeddings                     -- content-addressed vectors, deduped
  organization_id   String
  project_id        String
  content_hash      String             -- hash(canonical("{role}: {text}"))
  embedding         Array(Float32)     -- 2048 dims
  embedding_model   LowCardinality(String)
  last_seen_at      DateTime           -- refreshed on insert; drives TTL (90d)
  ORDER BY (organization_id, project_id, content_hash)

trace_message_occurrences              -- per-trace message positions, no vectors
  organization_id   String
  project_id        String
  trace_id          FixedString(32)
  message_index     UInt16
  content_hash      String
  session_id        String
  start_time        DateTime64         -- trace start time; search time filters
  role              LowCardinality(String)
  is_output         UInt8              -- message originated in this trace's output
  retention_days    UInt16             -- plan-resolved trace search retention
  ORDER BY (organization_id, project_id, content_hash, trace_id)
                                       -- join-direction order; secondary
                                       -- projection by (org, project, trace_id)
                                       -- for per-trace reads
```

Occurrence rows are small; vector rows are large. Full per-trace duplication at the occurrence layer is deliberate and cheap. The vectors are what was expensive.

### Writers

```text
trace-end -> trace-search worker (owns trace knowledge)
  for each message of the finished trace (input + output):
    canonicalize -> hash
    batch-lookup message_embeddings; embed misses (budget-gated); write-through
    insert occurrence rows unconditionally (idempotent: dedup on full key)

analyzeSession workflow (owns no trace knowledge)
  load session conversation (as today) -> normalize -> canonicalize -> hash
  batch-lookup message_embeddings; embed misses (budget-gated); write-through
  never touches occurrences
```

Indexing latency is unchanged: a trace is semantically searchable as soon as its trace-end job runs. For trace N in a session, the replayed history from traces 1..N-1 is all hash hits; only the new user turn and new output embed. CI's debounced analysis 5 minutes later is mostly hits.

### Search query path

Query embedding -> similarity scan over distinct vectors -> fan out to traces through the occurrence join -> max-pool per trace:

```sql
SELECT o.trace_id,
       max(e.score)                      AS semantic_score,
       argMax(o.message_index, e.score)  AS highlight_index
FROM trace_message_occurrences AS o
INNER JOIN (
    SELECT content_hash,
           1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)}) AS score
    FROM message_embeddings
    WHERE organization_id = {org} AND project_id = {project}
      AND score >= {floor}
) AS e ON o.content_hash = e.content_hash
WHERE o.organization_id = {org} AND o.project_id = {project}
  AND o.start_time BETWEEN {from} AND {to}
GROUP BY o.trace_id
ORDER BY semantic_score DESC
```

- Same shape as today's per-trace max pooling; `message_index` replaces the chunk's message range for highlights, at finer granularity.
- A matched message hits every trace containing it, matching today's behavior because each trace currently re-embeds its history. The `is_output` flag adds a signal today's design cannot express: rank the originating trace above replays, or collapse session duplicates in results.
- The 0.30 relevance floor must be re-tuned: score distributions shift with the unit change (whole role-prefixed messages vs 2k chunks).
- The join needs benchmarking on the largest orgs before cutover (occurrence table is ordered for the join direction; per-trace reads go through a projection).

### Conversation intelligence path

`embedTurns` becomes `resolveTurnEmbeddings`: hash each normalized message, batch-fetch vectors, embed-on-miss with write-through. Everything downstream, including `segmentSemanticMoments`, centroid/coherence math, `detectEmbeddingAnchorMoments`, persistence to `session_analyses` / `session_semantic_moments` / `session_moment_labels` / `taxonomy_observations`, is byte-for-byte unchanged; it receives the identical `SemanticSegmentationTurn[]`.

Session-scoped artifacts stay session-scoped: moment centroids are means over turn vectors computed per segment per analysis. They are not content-addressable (the same message lands in different segments as the session grows) and are free of API cost, so they remain in `session_semantic_moments`, not the shared store.

Two adjacent dedup wins ride along:

- **Anchor embeddings**: `MOMENT_LABEL_ANCHORS` texts are static per detector version but re-embedded every analysis pass. Cache them (shared store or precomputed constant).
- **Taxonomy projection**: a `projectionHash` is already computed; use it to skip re-embedding an unchanged 24k-char session projection.

### Compaction and the session spine (phase 4)

With occurrences recording every `(trace_id, message_index, content_hash, start_time)`, the session conversation can be redefined as distinct hashes in first-seen order instead of the current first/latest-trace reconstruction. Under compaction (trace 4 carries turns 1-8; trace 5 carries `[summary, turn 9]`), the spine is turns 1-8, then the summary, then turn 9. Nothing is lost or double-counted. Message indexes on moments and labels become append-stable.

This is a behavior change: it shifts `firstMessageIndex`/`lastMessageIndex` on persisted moments and labels, so it ships as its own phase with a `CONVERSATION_INTELLIGENCE_DETECTOR_VERSION` bump, never bundled into a cost optimization.

**Open question**: should the compaction summary message participate in segmentation/labeling? It is synthetic and may pollute anchor scoring (a summary that says "the user was frustrated" can trip `user_frustration`). Default position: include in the conversation record, exclude from anchor labeling when detectable (first occurrence mid-session with no prior occurrences is the candidate heuristic); needs validation on real compacted sessions.

## Out of scope

- The lexical index and its query path.
- Sub-message chunking for very long messages (follow-up, gated on search-recall regression).
- Moment ID stability across re-analyses (`momentId` includes `analysisHash` and already churns as sessions grow; pre-existing, orthogonal).
- Datasets, issues, and other trace-anchored surfaces, which are untouched by design.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### [x] Phase 1 - Shared canonicalization and vector store

- [x] **P1-1**: Add `canonicalizeMessageForEmbedding` + `hashMessageContent` to `@domain/spans` (canonical text `"{role}: {text}"`; hash via `@repo/utils` `hash`). Single source of truth for both pipelines.
- [x] **P1-2**: Create the `message_embeddings` table via `pnpm --filter @platform/db-clickhouse ch:create message_embeddings` (schema above, `last_seen_at`-driven TTL).
- [x] **P1-3**: Add a `MessageEmbeddingRepository` port (batch `findByHashes`, batch `upsert`) in `@domain/spans` with the ClickHouse adapter in `@platform/db-clickhouse`.
- [x] **P1-4**: Cross-pipeline hash-equality test: the same span normalized by the trace-search document builder and by CI message normalization must produce identical canonical strings and hashes.

**Exit gate**:

- [x] Store table and repository exist; no production reads or writes yet; hash-equality test green in CI.

### [ ] Phase 2 - Conversation intelligence on the store

- [ ] **P2-1**: Replace `embedTurns` with `resolveTurnEmbeddings` (hash -> batch lookup -> embed misses, budget-gated -> write-through). No changes to segmentation, labeling, or persisted schemas.
- [ ] **P2-2**: Cache anchor embeddings (static per `CONVERSATION_INTELLIGENCE_DETECTOR_VERSION`) instead of re-embedding per analysis pass.
- [ ] **P2-3**: Skip taxonomy projection re-embedding when `projectionHash` is unchanged from the latest observation.
- [ ] **P2-4**: Verify analysis outputs are identical pre/post on a fixture set (same moments, labels, centroids, confidences); the swap must be invisible to consumers.

**Exit gate**:

- [ ] Re-analysis of a grown session embeds only new messages; embedding call volume for CI drops accordingly in metrics; analysis outputs unchanged on fixtures.

### [ ] Phase 3 - Trace search on the store

- [ ] **P3-1**: Create `trace_message_occurrences` via `pnpm --filter @platform/db-clickhouse ch:create trace_message_occurrences` (join-direction ordering + per-trace projection).
- [ ] **P3-2**: Rework the trace-search worker write path: per-message hash -> vector ensure (embed-on-miss, budget-gated) -> unconditional idempotent occurrence inserts. Remove chunk building, head+tail truncation, and per-trace chunk dedup from the semantic path (lexical path untouched).
- [ ] **P3-3**: Implement the join-based search query (distinct-vector scan -> occurrence fan-out -> per-trace max pool, `message_index` highlights); re-tune the semantic relevance floor against the eval set used for the 0.30 calibration.
- [ ] **P3-4**: Benchmark the join on the largest orgs (latency + memory) vs the current single-table scan; add/adjust projections as needed.
- [ ] **P3-5**: Cut over reads behind a flag; after bake, stop writing `trace_search_embeddings` and let TTL drain it (drop table in a later append-only migration).
- [ ] **P3-6**: Decide backfill vs expire for existing `trace_search_embeddings` rows (default: no backfill; new traces index into the new model, old traces keep working via the old path until cutover, then age out within the 30-day retention).

**Exit gate**:

- [ ] Search results quality at parity or better on the eval set (notably: middle-of-long-trace recall, previously lost to head+tail truncation); per-org embedding token volume drops for multi-trace sessions; old table receiving no writes.

### [ ] Phase 4 - Occurrence-derived session spine

- [ ] **P4-1**: Replace the CI session-conversation reconstruction with distinct-hash-first-seen-order derived from `trace_message_occurrences`; bump `CONVERSATION_INTELLIGENCE_DETECTOR_VERSION`.
- [ ] **P4-2**: Resolve the compaction-summary open question (include in record, exclude from anchor labeling via first-occurrence heuristic); validate on real compacted sessions.
- [ ] **P4-3**: Update `dev-docs/conversation-intelligence.md` and `dev-docs/spans.md` to the final model; promote durable knowledge from this spec and delete it.

**Exit gate**:

- [ ] Compacted sessions analyze over the full distinct-message spine (verified on a compacted fixture); message indexes stable under session growth; docs updated, spec removed.
