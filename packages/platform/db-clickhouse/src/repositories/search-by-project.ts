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
  SessionSearchMatch,
} from "@domain/spans"
import { SESSION_SEARCH_MAX_MATCHING_TRACES_PER_ROW } from "@domain/spans"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect } from "effect"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { SESSION_FIELD_REGISTRY } from "../registries/session-fields.ts"
import { buildScoreRollupSubquery, splitScoreFilters } from "../score-filter-subquery.ts"
import { buildSessionIntelligenceFilters } from "../session-intelligence-filters.ts"
import { MAX_SEARCH_CANDIDATES, planSearch, type SearchPlan } from "./search-plan.ts"

/**
 * Session-level search read path. The trace-level `search-plan.ts` provides
 * `(trace_id, relevance_score)` candidates; we materialize that subquery
 * via `fetchSearchCandidates` in its own roundtrip, then feed the candidate
 * trace_ids and scores as parameter-bound arrays into a
 * `trace_rollup → session_rollup` query so results collapse to one row per
 * session with the matching-trace metadata the UI needs ("N matching
 * turns", drill-in on `bestTraceId`, etc.). The split keeps the `traces`
 * read on ClickHouse's PREWHERE-friendly path — see LAT-649 for the cliff
 * the previous single-statement JOIN form hit on XL projects.
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
  matching_trace_count: string
  matching_trace_ids: string[]
  matching_trace_scores: number[]
  session_start_time: string
  session_end_time: string
  cost_total_microcents: string
  span_count: string
  error_count: string
  tokens_total: string
  duration_ns: string
  time_to_first_token_ns: string
}

interface SearchSortAxis {
  readonly expr: string
  readonly chType: string
  readonly rowKey: keyof SessionSearchRow
}

const SEARCH_SORT_AXES: Record<string, SearchSortAxis> = {
  lastActivity: { expr: "session_end_time", chType: "DateTime64(9, 'UTC')", rowKey: "session_end_time" },
  startTime: { expr: "session_start_time", chType: "DateTime64(9, 'UTC')", rowKey: "session_start_time" },
  duration: { expr: "duration_ns", chType: "Int64", rowKey: "duration_ns" },
  ttft: { expr: "time_to_first_token_ns", chType: "Int64", rowKey: "time_to_first_token_ns" },
  cost: { expr: "cost_total_microcents", chType: "UInt64", rowKey: "cost_total_microcents" },
  spans: { expr: "span_count", chType: "UInt64", rowKey: "span_count" },
  traceCount: { expr: "matching_trace_count", chType: "UInt64", rowKey: "matching_trace_count" },
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
  // Conversation-intelligence filters (moments/topics) must be peeled off
  // BEFORE the field registry sees the set: they are not registry fields and
  // would be silently skipped, making the search path disagree with the
  // metrics/histogram panels. They compile to session_id IN (...) clauses
  // that resolve against the rollup's session_id in the HAVING.
  const ci = buildSessionIntelligenceFilters(filters)
  const { telemetryFilters, scoreFilters } = splitScoreFilters(ci.rest)
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
  const havingClauses = [...telemetry.clauses, ...ci.clauses]
  const finalHaving = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
  return { telemetryParams: { ...telemetry.params, ...ci.params }, traceScoreWhere, scoreParams, finalHaving }
}

type SearchCandidate = { trace_id: string; relevance_score: number }

/**
 * Run `plan.subquery` on its own roundtrip to materialize the candidate
 * `(trace_id, relevance_score)` set in the application. The session rollup
 * then receives those trace_ids as a parameter-bound array, so ClickHouse
 * keeps the `traces` read on the PREWHERE-friendly path and never falls off
 * the "read all AggregateFunction columns" cliff that the JOIN form hits
 * once the candidate set is more than a few hundred rows (LAT-649).
 *
 * The inner `GROUP BY trace_id` collapses duplicate rows that lexical plans
 * can surface before `trace_search_documents` (a `ReplacingMergeTree`) has
 * merged. The outer `LIMIT {candidateCap:UInt32}` caps how many candidates
 * the application materializes, protecting the Node worker from broad
 * lexical phrases on XL projects — semantic plans already cap server-side
 * via `SEMANTIC_SCAN_LIMIT`, lexical/hybrid plans don't.
 */
const fetchSearchCandidates = ({
  organizationId,
  projectId,
  plan,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly plan: SearchPlan
}): Effect.Effect<readonly SearchCandidate[], RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
    return yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `SELECT trace_id, max(relevance_score) AS relevance_score
                  FROM (${plan.subquery})
                  GROUP BY trace_id
                  LIMIT {candidateCap:UInt32}`,
          query_params: {
            organizationId: organizationId as string,
            projectId: projectId as string,
            candidateCap: MAX_SEARCH_CANDIDATES,
            ...plan.params,
          },
          format: "JSONEachRow",
        })
        return result.json<SearchCandidate>()
      })
      .pipe(Effect.mapError((error) => toRepositoryError(error, "fetchSearchCandidates")))
  })

/**
 * The `trace_rollup` CTE body shared by the list and count queries.
 * Filters `traces` by the candidate `trace_id` set (parameter-bound array)
 * and finalizes the same aggregate columns `SESSION_FIELD_REGISTRY`
 * references so the per-trace `HAVING` resolves. `relevance_score` flows in
 * via the `scoreByTrace` Map declared in the outer WITH clause — see
 * `fetchSearchCandidates` for why this isn't a join.
 *
 * **Coupling**: this string is not standalone. Any query that embeds it
 * MUST declare the following alias earlier in the same `WITH`:
 *   `mapFromArrays({traceIds:Array(FixedString(32))},
 *                  {relevanceScores:Array(Float64)}) AS scoreByTrace`
 * Otherwise the `scoreByTrace[t.trace_id]` lookup will fail at ClickHouse
 * parse time with no TypeScript warning.
 *
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
    max(scoreByTrace[t.trace_id])                  AS relevance_score
  FROM traces t
  WHERE t.organization_id = {organizationId:String}
    AND t.project_id = {projectId:String}
    AND t.trace_id IN ({traceIds:Array(FixedString(32))})
`

interface ListSearchInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly parsed: ParsedSearchQuery
  readonly filters: FilterSet | undefined
  readonly cursor: SessionListCursor | undefined
  readonly limit: number
  readonly sortBy: string | undefined
  readonly sortDirection: "asc" | "desc" | undefined
  readonly fetchFullSessions: FetchFullSessions
}

export const listSessionsBySearchQuery = ({
  organizationId,
  projectId,
  parsed,
  filters,
  cursor,
  limit,
  sortBy,
  sortDirection,
  fetchFullSessions,
}: ListSearchInput): Effect.Effect<SessionListPage, RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
    const plan = yield* planSearch(parsed)
    const { telemetryParams, traceScoreWhere, scoreParams, finalHaving } = buildSearchFilters(filters)

    const candidates = yield* fetchSearchCandidates({ organizationId, projectId, plan })
    if (candidates.length === 0) {
      return { items: [], hasMore: false, searchMatches: {} } satisfies SessionListPage
    }
    const traceIds = candidates.map((c) => normalizeCHString(c.trace_id))
    const relevanceScores = candidates.map((c) => Number(c.relevance_score))

    const axis = sortBy ? SEARCH_SORT_AXES[sortBy] : undefined
    const primaryExpr = axis ? axis.expr : "best_score"
    const primaryChType = axis ? axis.chType : "Float64"
    const orderDir = sortDirection === "asc" ? "ASC" : "DESC"
    const cmp = orderDir === "DESC" ? "<" : ">"
    const orderClause = `ORDER BY ${primaryExpr} ${orderDir}, session_end_time ${orderDir}, session_id ${orderDir}`
    const sessionCursorClause = cursor
      ? `HAVING (${primaryExpr}, session_end_time, session_id) ${cmp}
           ({cursorSortValue:${primaryChType}},
            {cursorSecondaryValue:DateTime64(9, 'UTC')},
            {cursorSessionId:String})`
      : ""

    const rows = yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `WITH
                    mapFromArrays(
                      {traceIds:Array(FixedString(32))},
                      {relevanceScores:Array(Float64)}
                    ) AS scoreByTrace,
                    trace_rollup AS (${TRACE_ROLLUP_BODY}
                    ${traceScoreWhere}
                    GROUP BY
                      t.organization_id, t.project_id, t.trace_id
                    ${finalHaving}
                  )
                  SELECT
                    organization_id,
                    project_id,
                    session_id,
                    max(relevance_score)                                            AS best_score,
                    argMax(trace_id, relevance_score)                               AS best_trace_id,
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
                    sum(tokens_total)                                               AS tokens_total,
                    sum(duration_ns)                                                AS duration_ns,
                    sum(time_to_first_token_ns)                                     AS time_to_first_token_ns
                  FROM trace_rollup
                  GROUP BY organization_id, project_id, session_id
                  ${sessionCursorClause}
                  ${orderClause}
                  LIMIT {limit:UInt32}`,
          query_params: {
            organizationId: organizationId as string,
            projectId: projectId as string,
            traceIds,
            relevanceScores,
            limit: limit + 1,
            matchingTracesCap: SESSION_SEARCH_MAX_MATCHING_TRACES_PER_ROW,
            ...telemetryParams,
            ...scoreParams,
            ...(cursor
              ? {
                  cursorSortValue: cursor.sortValue,
                  cursorSecondaryValue: cursor.secondaryValue ?? "1970-01-01 00:00:00.000000000",
                  cursorSessionId: cursor.sessionId,
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
    const cursorRowKey: keyof SessionSearchRow = axis ? axis.rowKey : "best_score"
    return {
      items,
      hasMore,
      nextCursor: {
        sortValue: String(last[cursorRowKey]),
        secondaryValue: last.session_end_time,
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

    const candidates = yield* fetchSearchCandidates({ organizationId, projectId, plan })
    if (candidates.length === 0) {
      return { totalCount: 0, matchingTraceCount: 0 } satisfies SessionCountResult
    }
    const traceIds = candidates.map((c) => normalizeCHString(c.trace_id))
    const relevanceScores = candidates.map((c) => Number(c.relevance_score))

    return yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `WITH
                    mapFromArrays(
                      {traceIds:Array(FixedString(32))},
                      {relevanceScores:Array(Float64)}
                    ) AS scoreByTrace,
                    trace_rollup AS (${TRACE_ROLLUP_BODY}
                    ${traceScoreWhere}
                    GROUP BY
                      t.organization_id, t.project_id, t.trace_id
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
            traceIds,
            relevanceScores,
            ...telemetryParams,
            ...scoreParams,
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
