/**
 * Per-result search match for a session in a search-active list page.
 *
 * The match is **per result, not per session** — it is a property of the
 * session's appearance in a particular search response, not of the session
 * entity itself. That is why this lives outside `session.ts` and is surfaced
 * as a parallel `searchMatches` map on `SessionListPage` (keyed by
 * `sessionId`) rather than embedded into `SessionRecord`. The separation
 * mirrors how `score-analytics` keeps derived-on-read shapes out of its
 * base entities.
 *
 * Fields:
 *  - `bestScore` — `max(relevance_score)` over the session's matching
 *    traces. The aggregation choice (max vs avg vs top-k) is documented in
 *    `specs/session-problems/2-session-level-search.md` §4.2; the SQL in
 *    `search-by-project.ts` hardcodes `max(...)`.
 *  - `bestTraceId` — trace id at `argMax(trace_id, relevance_score)`; the
 *    deep-link target for "open the most-relevant trace in this session".
 *  - `matchingTraceCount` — number of traces in the session that matched
 *    the query. Surfaced separately from the score so the UI can show
 *    "5 traces match" without baking the count into the ranking.
 *  - `matchingTraceIds` — every matching trace id, sorted by per-trace
 *    score descending.
 *  - `matchingTraceScores` — parallel-aligned scores for
 *    `matchingTraceIds[i]`. Two arrays instead of an array of pairs to
 *    keep the ClickHouse wire payload small and to match the
 *    `arrayMap(p -> p.N, ...)` shape produced by the repository query.
 */
export interface SessionSearchMatch {
  readonly bestScore: number
  readonly bestTraceId: string
  readonly matchingTraceCount: number
  readonly matchingTraceIds: readonly string[]
  readonly matchingTraceScores: readonly number[]
}
