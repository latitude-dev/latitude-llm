# Centralized Semantic Session Search

## Problem

The new conversation intelligence pipeline stores embeddings for analyzed sessions, while trace search still stores separate embeddings for trace chunks. Session search then runs semantic search over `trace_search_embeddings` and groups trace matches into sessions at read time.

That means we are paying for and storing overlapping embeddings, while the session-search product surface is still backed by trace-shaped semantic units.

## Recommendation

Centralize semantic session search on conversation intelligence data, using `session_semantic_moments` as the primary semantic-search corpus.

`session_semantic_moments` is the best fit because it stores per-session semantic segments with embeddings, `trace_id`, and message ranges. This aligns search with the session-level product surface and gives the UI a natural matched region for highlights.

Do not replace semantic search with `taxonomy_observations` alone. That table currently stores one session-level user-intent projection per analyzed session, which is useful for topic routing and clustering but too lossy for general semantic search over arbitrary conversation content.

Keep `trace_search_documents` for lexical phrase search initially. It has ClickHouse lexical indexes and includes content that conversation intelligence intentionally strips, such as reasoning and tool responses.

## Current State

- `apps/workers/src/workers/trace-search.ts` builds trace search documents and writes per-trace chunk embeddings to `trace_search_embeddings`.
- `packages/platform/db-clickhouse/src/repositories/search-plan.ts` queries `trace_search_embeddings` for semantic candidates.
- `packages/platform/db-clickhouse/src/repositories/search-by-project.ts` rolls trace-level candidates up to session-level results.
- `packages/domain/conversation-intelligence/src/use-cases/analyze-session.ts` already writes semantic moment embeddings to `session_semantic_moments`.
- `taxonomy_observations` stores session-level user-intent projections for taxonomy routing, not full search coverage.

## Target Shape

Session semantic search should query current-generation semantic moments directly and roll them up to one result per session:

```sql
SELECT
  session_id,
  max(1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS relevance_score,
  argMax(moment_id, relevance_score) AS matched_moment_id,
  argMax(trace_id, relevance_score) AS best_trace_id,
  argMax(first_message_index, relevance_score) AS matched_first_message_index,
  argMax(last_message_index, relevance_score) AS matched_last_message_index
FROM session_semantic_moments
WHERE organization_id = {organizationId:String}
  AND project_id = {projectId:String}
  AND (session_id, analysis_hash) IN (
    SELECT session_id, argMax(analysis_hash, indexed_at)
    FROM session_analyses
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
    GROUP BY session_id
  )
GROUP BY session_id
```

The generation pin is mandatory. Unpinned reads over conversation-intelligence tables can return superseded moment generations and duplicate or stale results.

## Migration Path

1. Add a conversation-intelligence-backed semantic search plan for session search.
2. Keep trace-list semantic search unchanged until we decide whether trace-level semantic search remains a product surface.
3. Keep lexical search on `trace_search_documents` while semantic search moves to `session_semantic_moments`.
4. Backfill conversation intelligence for retained sessions so semantic coverage is comparable to existing trace search coverage.
5. Stop writing new `trace_search_embeddings` once coverage and scoring are acceptable.
6. Let existing trace embeddings TTL out, then remove the table and write path in a later cleanup.

## Compatibility Risks

- Conversation intelligence only indexes analyzed sessions. Current trace semantic search can cover orphan traces, telemetry-only traces, and analysis failures.
- Semantic scores will shift because trace search embeds packed trace chunks, while conversation intelligence stores moment centroids from normalized user/assistant turns.
- Trace-level semantic highlights currently depend on trace chunk metadata. Session search can highlight matched moments, but trace-detail search needs either fallback behavior or an adapted highlight path.
- `taxonomy_observations` should remain a topic and clustering signal, not the sole semantic-search corpus.

## Open Decision

Decide whether semantic search should intentionally become an analyzed-conversation-only feature.

If yes, remove trace semantic embeddings after backfill. If no, add a fallback path for unanalyzed traces or introduce a shared search-projection table populated by the conversation analyzer plus a degraded trace path for non-conversation telemetry.
