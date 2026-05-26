import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  type FilterSet,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SessionId,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
} from "@domain/shared"
import type {
  ParsedSearchQuery,
  Session,
  SessionCountResult,
  SessionListCursor,
  SessionListPage,
  SessionSearchCursor,
  SessionSearchMatch,
} from "@domain/spans"
import {
  SESSION_SEARCH_MAX_CLOCK_SKEW_MS,
  SESSION_SEARCH_MAX_MATCHING_TRACES_PER_ROW,
  SESSION_SEARCH_RELEVANCE_BUCKET_WIDTH,
} from "@domain/spans"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect } from "effect"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { SESSION_FIELD_REGISTRY } from "../registries/session-fields.ts"
import { buildScoreRollupSubquery, splitScoreFilters } from "../score-filter-subquery.ts"
import { planSearch } from "./search-plan.ts"

/**
 * Session-level search read path. The trace-level `search-plan.ts` provides
 * `(trace_id, relevance_score)` candidates; here we wrap that subquery in a
 * `search_results → trace_rollup → session_rollup` CTE chain (spec §4.3) so
 * results collapse to one row per session with the matching-trace metadata
 * the UI needs ("N matching turns", drill-in on `bestTraceId`, etc.).
 *
 * The functions in this file are pure read-side: they own the search SQL and
 * the per-session row → domain mapping, but defer to a `fetchFullSessions`
 * callback for the "give me the full Session shape for these matched ids"
 * step. That keeps `LIST_SELECT` / `toDomainSession` colocated with the rest
 * of the session projection in `session-repository.ts` and avoids a
 * circular import.
 */

/**
 * Row shape returned by the session-rollup search query (§4.3). The outer
 * `SELECT … GROUP BY session_id` produces per-session search metadata
 * (`best_*`, `matching_*`) together with rolled-up numerics over the
 * session's matching traces; we use the numerics to synthesize a minimal
 * `Session` for orphan traces that have no row in the `sessions` table.
 */
type SessionSearchRow = {
  organization_id: string
  project_id: string
  session_id: string
  // Float64 — ClickHouse `JSONEachRow` returns Float64 as a JSON number, not
  // a string (unlike UInt64 / Int64, which arrive as strings to avoid JS
  // overflow). Same shape used in `trace-repository.ts` for the ranked
  // search path.
  best_score: number
  best_trace_id: string
  // Fixed-width snap of `best_score` (see SESSION_SEARCH_RELEVANCE_BUCKET_WIDTH).
  // Drives the freshness-weighted sort tuple alongside `last_activity_at`.
  relevance_bucket: number
  // Session-level `max_end_time`, clamped to `now() + SESSION_SEARCH_MAX_CLOCK_SKEW_MS`
  // to neutralize bad client clocks. ISO-8601 string from JSONEachRow.
  last_activity_at: string
  matching_trace_count: string
  matching_trace_ids: string[]
  matching_trace_scores: number[]
  session_start_time: string
  session_end_time: string
  cost_total_microcents: string
  span_count: string
  error_count: string
  tokens_total: string
}

const toSearchMatch = (row: SessionSearchRow): SessionSearchMatch => ({
  bestScore: Number(row.best_score),
  bestTraceId: normalizeCHString(row.best_trace_id),
  matchingTraceCount: Number(row.matching_trace_count),
  matchingTraceIds: row.matching_trace_ids.map(normalizeCHString),
  matchingTraceScores: row.matching_trace_scores.map((s) => Number(s)),
})

/**
 * Build a minimal `Session` entity for a matched trace whose derived
 * `session_id` isn't resolvable in the `sessions` table. Two cases:
 *
 * 1. **Pre-migration orphan trace.** Before migration 00016 (#3224)
 *    `sessions_mv` filtered `WHERE session_id != ''`, so traces without
 *    `gen_ai.conversation.id` never got a row in `sessions`. Their search
 *    documents / embeddings DO still exist (the worker indexes by trace,
 *    not by session). Until those pre-migration entries age out of the
 *    search index (lexical TTL 90 days, embedding TTL 30 days), the
 *    fallback is the only way they surface in search results — without
 *    it we'd hide matches that today's trace-level search shows. **This
 *    is the primary reason this function exists.**
 *
 * 2. **MV replication lag.** Steady-state, rare: a `traces` write has
 *    landed on this replica but the corresponding `sessions_mv` write
 *    hasn't propagated yet. The synthesized row is a degraded view of
 *    correct-but-not-yet-readable data — better than a missing row in
 *    the search results.
 *
 * Once 90 days have passed since 00016 hit production, case (1) is
 * provably empty and we can revisit: keep the fallback for case (2), or
 * switch to drop-on-miss and accept brief under-counts during MV races.
 *
 * Remaining `Session` fields default to empty — orphan traces carry the
 * same `tokens_total = 0` / `models = []` visual signature used elsewhere
 * in the product (spec §6.7).
 */
const toOrphanSession = (row: SessionSearchRow): Session => {
  const startTime = parseCHDate(row.session_start_time)
  const endTime = parseCHDate(row.session_end_time)
  const traceIds = row.matching_trace_ids.map(normalizeCHString)
  return {
    organizationId: toOrganizationId(normalizeCHString(row.organization_id)),
    projectId: toProjectId(normalizeCHString(row.project_id)),
    sessionId: SessionId(normalizeCHString(row.session_id)),
    traceCount: traceIds.length,
    traceIds,
    spanCount: Number(row.span_count),
    errorCount: Number(row.error_count),
    startTime,
    endTime,
    lastActivityTime: endTime,
    durationNs: 0,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: Number(row.tokens_total),
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: Number(row.cost_total_microcents),
    userId: ExternalUserId(""),
    simulationId: "",
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: "",
    rootSpanName: "",
  }
}

/**
 * Resolve full `Session` rows for the matched ids returned by the search
 * rollup. Implementation lives in `session-repository.ts` where
 * `LIST_SELECT` and `toDomainSession` are defined — passing it in here as a
 * callback avoids a circular import without duplicating the projection.
 * Orphan-trace synthesized ids (`toString(trace_id)`) won't be present in
 * the returned map; the caller falls back to `toOrphanSession`.
 */
export type FetchFullSessions = (
  sessionIds: readonly string[],
) => Effect.Effect<ReadonlyMap<string, Session>, RepositoryError, ChSqlClient>

/**
 * Build the per-trace HAVING + score-filter pieces shared by the list and
 * count search queries. Score filters reference the trace-level `trace_id`
 * column (we're filtering rows in `trace_rollup`, not post-rollup session
 * rows); telemetry filters use `SESSION_FIELD_REGISTRY` against the
 * finalized aggregate columns projected inside `trace_rollup` itself.
 */
const buildSearchFilters = (filters: FilterSet | undefined) => {
  const { telemetryFilters, scoreFilters } = splitScoreFilters(filters)
  const telemetry = telemetryFilters
    ? buildClickHouseWhere(telemetryFilters, SESSION_FIELD_REGISTRY)
    : { clauses: [], params: {} }
  let traceScoreWhere = ""
  let scoreParams: Record<string, unknown> = {}
  if (scoreFilters) {
    const result = buildScoreRollupSubquery("trace_id", scoreFilters, false)
    traceScoreWhere = `AND ${result.subquery}`
    scoreParams = result.params
  }
  const finalHaving = telemetry.clauses.length > 0 ? `HAVING ${telemetry.clauses.join(" AND ")}` : ""
  return { telemetryParams: telemetry.params, traceScoreWhere, scoreParams, finalHaving }
}

/**
 * The `trace_rollup` CTE body shared by the list and count queries. Reads
 * from `traces ⨝ search_results` and finalizes the same aggregate columns
 * `SESSION_FIELD_REGISTRY` references so the per-trace `HAVING` resolves.
 * Mirrors `trace-repository.ts:LIST_SELECT`. (Filter on `traceCount` is a
 * session-level concept and isn't supported in search mode; tracked as
 * follow-up.)
 */
const TRACE_ROLLUP_BODY = `
  SELECT
    t.organization_id                              AS organization_id,
    t.project_id                                   AS project_id,
    t.trace_id                                     AS trace_id,
    coalesce(
      nullIf(argMaxIfMerge(t.session_id), ''),
      toString(t.trace_id)
    )                                              AS session_id,
    argMaxIfMerge(t.user_id)                       AS user_id,
    argMaxIfMerge(t.simulation_id)                 AS simulation_id,
    groupUniqArrayArray(t.tags)                    AS tags,
    groupUniqArrayIfMerge(t.models)                AS models,
    groupUniqArrayIfMerge(t.providers)             AS providers,
    groupUniqArrayIfMerge(t.service_names)         AS service_names,
    argMinIfMerge(t.root_span_name)                AS root_span_name,
    sum(t.cost_total_microcents)                   AS cost_total_microcents,
    sum(t.span_count)                              AS span_count,
    sum(t.error_count)                             AS error_count,
    sum(t.tokens_total)                            AS tokens_total,
    sum(t.tokens_input)                            AS tokens_input,
    sum(t.tokens_output)                           AS tokens_output,
    reinterpretAsInt64(max(t.max_end_time))
      - reinterpretAsInt64(min(t.min_start_time))  AS duration_ns,
    if(
      min(t.time_of_first_token) < toDateTime64('2261-01-01', 9, 'UTC'),
      reinterpretAsInt64(min(t.time_of_first_token))
        - reinterpretAsInt64(min(t.min_start_time)),
      toInt64(0)
    )                                              AS time_to_first_token_ns,
    min(t.min_start_time)                          AS start_time,
    max(t.max_end_time)                            AS end_time,
    search_results.relevance_score                 AS relevance_score
  FROM traces t
  INNER JOIN search_results ON t.trace_id = search_results.trace_id
  WHERE t.organization_id = {organizationId:String}
    AND t.project_id = {projectId:String}
`

interface ListSearchInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly parsed: ParsedSearchQuery
  readonly filters: FilterSet | undefined
  readonly cursor: SessionListCursor | SessionSearchCursor | undefined
  readonly limit: number
  readonly fetchFullSessions: FetchFullSessions
}

/**
 * Search-path cursor carries the freshness-weighted sort tuple. Legacy
 * `SessionListCursor` values (from clients on the prior cursor shape) are
 * silently dropped — keyset pagination will restart from the top, which is
 * the only safe behavior when the cursor's encoded sort key doesn't match
 * the query's actual ORDER BY.
 */
const isSearchCursor = (cursor: SessionListCursor | SessionSearchCursor | undefined): cursor is SessionSearchCursor =>
  cursor !== undefined && "relevanceBucket" in cursor && "lastActivityAt" in cursor

/**
 * Search-active list path (spec §4.3). Runs the trace → session rollup
 * query, then resolves full `Session` rows via `fetchFullSessions`
 * (orphan-trace synthesized ids that don't exist in the `sessions` table
 * fall back to `toOrphanSession`).
 */
export const listSessionsBySearchQuery = ({
  organizationId,
  projectId,
  parsed,
  filters,
  cursor,
  limit,
  fetchFullSessions,
}: ListSearchInput): Effect.Effect<SessionListPage, RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
    const plan = yield* planSearch(parsed)
    const { telemetryParams, traceScoreWhere, scoreParams, finalHaving } = buildSearchFilters(filters)

    const searchCursor = isSearchCursor(cursor) ? cursor : undefined
    // HAVING references the SELECT aliases (CH lets it see them) so the
    // bucket and last_activity expressions stay defined in exactly one
    // place — the outer projection below.
    const sessionCursorClause = searchCursor
      ? `HAVING (relevance_bucket, last_activity_at, session_id) < (
           {cursorBucket:Float64},
           {cursorLastActivityAt:DateTime64(9, 'UTC')},
           {cursorSessionId:String}
         )`
      : ""

    const rows = yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `WITH search_results AS (
                    SELECT trace_id, relevance_score FROM (${plan.subquery})
                  ),
                  trace_rollup AS (${TRACE_ROLLUP_BODY}
                    ${traceScoreWhere}
                    GROUP BY
                      t.organization_id, t.project_id, t.trace_id,
                      search_results.relevance_score
                    ${finalHaving}
                  ),
                  -- Pre-aggregate the sessions table's max_end_time for the
                  -- candidate set only. sessions.max_end_time is a
                  -- SimpleAggregateFunction(max, ...) so plain reads can
                  -- see a single unmerged part; max() finalizes across
                  -- parts. The IN clause keeps the scan bounded to the
                  -- session_ids that actually matched.
                  session_freshness AS (
                    SELECT
                      session_id,
                      max(max_end_time) AS sess_max_end_time
                    FROM sessions
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND session_id IN (SELECT session_id FROM trace_rollup)
                    GROUP BY session_id
                  )
                  SELECT
                    organization_id,
                    project_id,
                    session_id,
                    max(relevance_score)                                            AS best_score,
                    argMax(trace_id, relevance_score)                               AS best_trace_id,
                    floor(max(relevance_score) / {bucketWidth:Float64})
                      * {bucketWidth:Float64}                                       AS relevance_bucket,
                    least(
                      coalesce(any(sf.sess_max_end_time), max(end_time)),
                      addMilliseconds(now64(9, 'UTC'), {clockSkewMs:UInt32})
                    )                                                               AS last_activity_at,
                    count()                                                         AS matching_trace_count,
                    arrayMap(
                      pair -> pair.1,
                      arraySlice(
                        arrayReverseSort(pair -> pair.2, groupArray((trace_id, relevance_score))),
                        1,
                        {matchingTracesCap:UInt32}
                      )
                    )                                                               AS matching_trace_ids,
                    arrayMap(
                      pair -> pair.2,
                      arraySlice(
                        arrayReverseSort(pair -> pair.2, groupArray((trace_id, relevance_score))),
                        1,
                        {matchingTracesCap:UInt32}
                      )
                    )                                                               AS matching_trace_scores,
                    min(start_time)                                                 AS session_start_time,
                    max(end_time)                                                   AS session_end_time,
                    sum(cost_total_microcents)                                      AS cost_total_microcents,
                    sum(span_count)                                                 AS span_count,
                    sum(error_count)                                                AS error_count,
                    sum(tokens_total)                                               AS tokens_total
                  FROM trace_rollup
                  LEFT JOIN session_freshness AS sf USING (session_id)
                  GROUP BY organization_id, project_id, session_id
                  ${sessionCursorClause}
                  ORDER BY relevance_bucket DESC, last_activity_at DESC, session_id DESC
                  LIMIT {limit:UInt32}`,
          query_params: {
            organizationId: organizationId as string,
            projectId: projectId as string,
            limit: limit + 1,
            matchingTracesCap: SESSION_SEARCH_MAX_MATCHING_TRACES_PER_ROW,
            bucketWidth: SESSION_SEARCH_RELEVANCE_BUCKET_WIDTH,
            clockSkewMs: SESSION_SEARCH_MAX_CLOCK_SKEW_MS,
            ...telemetryParams,
            ...scoreParams,
            ...plan.params,
            ...(searchCursor
              ? {
                  cursorBucket: searchCursor.relevanceBucket,
                  cursorLastActivityAt: searchCursor.lastActivityAt,
                  cursorSessionId: searchCursor.sessionId,
                }
              : {}),
          },
          format: "JSONEachRow",
        })
        return result.json<SessionSearchRow>()
      })
      .pipe(Effect.mapError((error) => toRepositoryError(error, "listByProjectId")))

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows

    // Two-query strategy: the trace rollup gives us the candidate
    // session_ids ordered by relevance, but doesn't carry the full
    // `Session` shape (`models`, `providers`, `tags`, ...). Resolve those
    // from the `sessions` table via the caller's `fetchFullSessions`
    // callback; orphan-trace synthesized ids that aren't in `sessions`
    // fall back to `toOrphanSession`.
    const sessionIds = pageRows.map((r) => normalizeCHString(r.session_id))
    const sessionsById = yield* fetchFullSessions(sessionIds)

    const items: Session[] = []
    const searchMatches: Record<string, SessionSearchMatch> = {}
    for (const row of pageRows) {
      const sessionId = normalizeCHString(row.session_id)
      const full = sessionsById.get(sessionId)
      items.push(full ?? toOrphanSession(row))
      searchMatches[sessionId] = toSearchMatch(row)
    }

    const last = hasMore ? pageRows[pageRows.length - 1] : undefined
    if (!last) return { items, hasMore, searchMatches }
    return {
      items,
      hasMore,
      nextCursor: {
        relevanceBucket: Number(last.relevance_bucket),
        // Pass CH's DateTime64 string back unchanged: ClickHouse accepts the
        // same ISO-8601 form it emits as `{x:DateTime64(9, 'UTC')}` input,
        // so round-tripping through the wire as a string preserves the
        // nanosecond precision the cursor predicate needs.
        lastActivityAt: last.last_activity_at,
        sessionId: normalizeCHString(last.session_id),
      },
      searchMatches,
    }
  })

interface CountSearchInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly parsed: ParsedSearchQuery
  readonly filters: FilterSet | undefined
}

/**
 * Search-active count path (spec §4.6). Uses the same CTE shape as the
 * list query so the candidate set matches exactly. Returns
 * `{ totalCount, matchingTraceCount }` so the UI can render
 * "N sessions · M matching turns".
 */
export const countSessionsBySearchQuery = ({
  organizationId,
  projectId,
  parsed,
  filters,
}: CountSearchInput): Effect.Effect<SessionCountResult, RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
    const plan = yield* planSearch(parsed)
    const { telemetryParams, traceScoreWhere, scoreParams, finalHaving } = buildSearchFilters(filters)

    return yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `WITH search_results AS (
                    SELECT trace_id, relevance_score FROM (${plan.subquery})
                  ),
                  trace_rollup AS (${TRACE_ROLLUP_BODY}
                    ${traceScoreWhere}
                    GROUP BY
                      t.organization_id, t.project_id, t.trace_id,
                      search_results.relevance_score
                    ${finalHaving}
                  ),
                  session_rollup AS (
                    SELECT
                      session_id,
                      count() AS matching_trace_count
                    FROM trace_rollup
                    GROUP BY session_id
                  )
                  SELECT
                    count() AS total,
                    sum(matching_trace_count) AS matching_trace_count_total
                  FROM session_rollup`,
          query_params: {
            organizationId: organizationId as string,
            projectId: projectId as string,
            ...telemetryParams,
            ...scoreParams,
            ...plan.params,
          },
          format: "JSONEachRow",
        })
        return result.json<{ total: string; matching_trace_count_total: string }>()
      })
      .pipe(
        Effect.map((rows) => ({
          totalCount: Number(rows[0]?.total ?? 0),
          matchingTraceCount: Number(rows[0]?.matching_trace_count_total ?? 0),
        })),
        Effect.mapError((error) => toRepositoryError(error, "countByProjectId")),
      )
  })
