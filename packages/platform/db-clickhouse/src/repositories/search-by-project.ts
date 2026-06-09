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
  SimulationId,
  SpanId,
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
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect } from "effect"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { SESSION_FIELD_REGISTRY } from "../registries/session-fields.ts"
import { buildScoreRollupSubquery, splitScoreFilters } from "../score-filter-subquery.ts"
import { buildSessionIntelligenceFilters } from "../session-intelligence-filters.ts"
import { MAX_SEARCH_CANDIDATES } from "./search-plan.ts"
import { planSessionSearch, type SessionSearchPlan } from "./session-search-plan.ts"

/**
 * Session-level search read path. Candidate queries return session ids and
 * session-level match metadata. The final query reads `sessions` directly so
 * search results are sessions from end to end; trace ids are not part of the
 * search contract.
 */

type SessionSearchRow = {
  organization_id: string
  project_id: string
  session_id: string
  trace_count: string
  trace_ids: string[]
  span_count: string
  error_count: string
  start_time: string
  end_time: string
  last_activity_time: string
  duration_ns: string
  time_to_first_token_ns: string
  tokens_input: string
  tokens_output: string
  tokens_cache_read: string
  tokens_cache_create: string
  tokens_reasoning: string
  tokens_total: string
  cost_input_microcents: string
  cost_output_microcents: string
  cost_total_microcents: string
  user_id: string
  tags: string[]
  metadata: Record<string, string>
  models: string[]
  providers: string[]
  service_names: string[]
  simulation_id: string
  root_span_id: string
  root_span_name: string
  best_score: number
  matched_first_message_index: number | null
  matched_last_message_index: number | null
}

interface SearchSortAxis {
  readonly expr: string
  readonly chType: string
  readonly rowKey: keyof SessionSearchRow
}

const SEARCH_SORT_AXES: Record<string, SearchSortAxis> = {
  lastActivity: { expr: "last_activity_time", chType: "DateTime64(9, 'UTC')", rowKey: "last_activity_time" },
  startTime: { expr: "start_time", chType: "DateTime64(9, 'UTC')", rowKey: "start_time" },
  duration: { expr: "duration_ns", chType: "Int64", rowKey: "duration_ns" },
  ttft: { expr: "time_to_first_token_ns", chType: "Int64", rowKey: "time_to_first_token_ns" },
  cost: { expr: "cost_total_microcents", chType: "UInt64", rowKey: "cost_total_microcents" },
  spans: { expr: "span_count", chType: "UInt64", rowKey: "span_count" },
  traceCount: { expr: "trace_count", chType: "UInt64", rowKey: "trace_count" },
}

const toSearchMatch = (row: SessionSearchRow): SessionSearchMatch => ({
  bestScore: Number(row.best_score),
  ...(row.matched_first_message_index !== null
    ? { matchedFirstMessageIndex: Number(row.matched_first_message_index) }
    : {}),
  ...(row.matched_last_message_index !== null
    ? { matchedLastMessageIndex: Number(row.matched_last_message_index) }
    : {}),
})

const toDomainSession = (row: SessionSearchRow): Session => ({
  organizationId: toOrganizationId(normalizeCHString(row.organization_id)),
  projectId: toProjectId(normalizeCHString(row.project_id)),
  sessionId: SessionId(normalizeCHString(row.session_id)),
  traceCount: Number(row.trace_count),
  traceIds: row.trace_ids.map(normalizeCHString),
  spanCount: Number(row.span_count),
  errorCount: Number(row.error_count),
  startTime: parseCHDate(row.start_time),
  endTime: parseCHDate(row.end_time),
  lastActivityTime: parseCHDate(row.last_activity_time),
  durationNs: Number(row.duration_ns),
  timeToFirstTokenNs: Number(row.time_to_first_token_ns),
  tokensInput: Number(row.tokens_input),
  tokensOutput: Number(row.tokens_output),
  tokensCacheRead: Number(row.tokens_cache_read),
  tokensCacheCreate: Number(row.tokens_cache_create),
  tokensReasoning: Number(row.tokens_reasoning),
  tokensTotal: Number(row.tokens_total),
  costInputMicrocents: Number(row.cost_input_microcents),
  costOutputMicrocents: Number(row.cost_output_microcents),
  costTotalMicrocents: Number(row.cost_total_microcents),
  userId: ExternalUserId(normalizeCHString(row.user_id)),
  simulationId: SimulationId(normalizeCHString(row.simulation_id)),
  tags: row.tags.map(normalizeCHString),
  metadata: row.metadata ?? {},
  models: row.models.map(normalizeCHString),
  providers: row.providers.map(normalizeCHString),
  serviceNames: row.service_names.map(normalizeCHString),
  rootSpanId: SpanId(normalizeCHString(row.root_span_id)),
  rootSpanName: normalizeCHString(row.root_span_name),
})

const SESSION_SEARCH_SELECT = `
  organization_id,
  project_id,
  session_id,
  uniqExactMerge(trace_count)  AS trace_count,
  groupUniqArrayMerge(trace_ids) AS trace_ids,
  sum(span_count)              AS span_count,
  sum(error_count)             AS error_count,
  min(min_start_time)          AS start_time,
  max(max_end_time)            AS end_time,
  if(max(max_start_time) >= min(min_start_time),
     max(max_start_time),
     max(max_end_time))         AS last_activity_time,
  sum(duration_ns)             AS duration_ns,
  if(
    min(time_of_first_token) < toDateTime64('2261-01-01', 9, 'UTC')
      AND min(time_of_first_token) > min(min_start_time),
    reinterpretAsInt64(min(time_of_first_token))
      - reinterpretAsInt64(min(min_start_time)),
    0
  )                              AS time_to_first_token_ns,
  sum(tokens_input)            AS tokens_input,
  sum(tokens_output)           AS tokens_output,
  sum(tokens_cache_read)       AS tokens_cache_read,
  sum(tokens_cache_create)     AS tokens_cache_create,
  sum(tokens_reasoning)        AS tokens_reasoning,
  sum(tokens_total)            AS tokens_total,
  sum(cost_input_microcents)   AS cost_input_microcents,
  sum(cost_output_microcents)  AS cost_output_microcents,
  sum(cost_total_microcents)   AS cost_total_microcents,
  argMaxIfMerge(user_id)       AS user_id,
  groupUniqArrayArray(tags)    AS tags,
  maxMap(metadata)             AS metadata,
  groupUniqArrayIfMerge(models)        AS models,
  groupUniqArrayIfMerge(providers)     AS providers,
  groupUniqArrayIfMerge(service_names) AS service_names,
  argMaxIfMerge(simulation_id)         AS simulation_id,
  argMinIfMerge(root_span_id)          AS root_span_id,
  argMinIfMerge(root_span_name)        AS root_span_name,
  max(scoreBySession[session_id])      AS best_score,
  nullIf(max(firstBySession[session_id]), -1) AS matched_first_message_index,
  nullIf(max(lastBySession[session_id]), -1)  AS matched_last_message_index
`

const buildSearchFilters = (filters: FilterSet | undefined) => {
  if (!filters || Object.keys(filters).length === 0) {
    return { havingClauses: [], whereClauses: [], params: {} }
  }

  const ci = buildSessionIntelligenceFilters(filters)
  const { telemetryFilters, scoreFilters } = splitScoreFilters(ci.rest)
  const telemetry = telemetryFilters
    ? buildClickHouseWhere(telemetryFilters, SESSION_FIELD_REGISTRY)
    : { clauses: [], params: {} }

  const whereClauses: string[] = [...ci.clauses]
  let scoreParams: Record<string, unknown> = {}
  if (scoreFilters) {
    const result = buildScoreRollupSubquery("session_id", scoreFilters, false)
    whereClauses.push(result.subquery)
    scoreParams = result.params
  }

  return {
    havingClauses: telemetry.clauses,
    whereClauses,
    params: { ...telemetry.params, ...scoreParams, ...ci.params },
  }
}

type SearchCandidate = {
  session_id: string
  relevance_score: number
  matched_first_message_index: number | null
  matched_last_message_index: number | null
}

const fetchSearchCandidates = ({
  organizationId,
  projectId,
  plan,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly plan: SessionSearchPlan
}): Effect.Effect<readonly SearchCandidate[], RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
    return yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `SELECT
                    session_id,
                    relevance_score,
                    matched_first_message_index,
                    matched_last_message_index
                  FROM (${plan.subquery})
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

interface ListSearchInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly parsed: ParsedSearchQuery
  readonly filters: FilterSet | undefined
  readonly cursor: SessionListCursor | undefined
  readonly limit: number
  readonly sortBy: string | undefined
  readonly sortDirection: "asc" | "desc" | undefined
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
}: ListSearchInput): Effect.Effect<SessionListPage, RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
    const plan = yield* planSessionSearch(parsed)
    const { havingClauses, whereClauses, params: filterParams } = buildSearchFilters(filters)

    const candidates = yield* fetchSearchCandidates({ organizationId, projectId, plan })
    if (candidates.length === 0) {
      return { items: [], hasMore: false, searchMatches: {} } satisfies SessionListPage
    }

    const sessionIds = candidates.map((c) => normalizeCHString(c.session_id))
    const relevanceScores = candidates.map((c) => Number(c.relevance_score))
    const firstMessageIndexes = candidates.map((c) => c.matched_first_message_index ?? -1)
    const lastMessageIndexes = candidates.map((c) => c.matched_last_message_index ?? -1)

    const axis = sortBy ? SEARCH_SORT_AXES[sortBy] : undefined
    const primaryExpr = axis ? axis.expr : "best_score"
    const primaryChType = axis ? axis.chType : "Float64"
    const orderDir = sortDirection === "asc" ? "ASC" : "DESC"
    const cmp = orderDir === "DESC" ? "<" : ">"
    const orderClause = `ORDER BY ${primaryExpr} ${orderDir}, end_time ${orderDir}, session_id ${orderDir}`
    const cursorClause = cursor
      ? `(${primaryExpr}, end_time, session_id) ${cmp}
           ({cursorSortValue:${primaryChType}},
            {cursorSecondaryValue:DateTime64(9, 'UTC')},
            {cursorSessionId:String})`
      : ""
    const finalHavingClauses = [...havingClauses, ...(cursorClause ? [cursorClause] : [])]
    const finalHaving = finalHavingClauses.length > 0 ? `HAVING ${finalHavingClauses.join(" AND ")}` : ""
    const finalWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

    const rows = yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `WITH
                    mapFromArrays({sessionIds:Array(String)}, {relevanceScores:Array(Float64)}) AS scoreBySession,
                    mapFromArrays({sessionIds:Array(String)}, {firstMessageIndexes:Array(Int32)}) AS firstBySession,
                    mapFromArrays({sessionIds:Array(String)}, {lastMessageIndexes:Array(Int32)}) AS lastBySession
                  SELECT ${SESSION_SEARCH_SELECT}
                  FROM sessions
                  WHERE organization_id = {organizationId:String}
                    AND project_id = {projectId:String}
                    AND session_id IN ({sessionIds:Array(String)})
                    ${finalWhere}
                  GROUP BY organization_id, project_id, session_id
                  ${finalHaving}
                  ${orderClause}
                  LIMIT {limit:UInt32}`,
          query_params: {
            organizationId: organizationId as string,
            projectId: projectId as string,
            sessionIds,
            relevanceScores,
            firstMessageIndexes,
            lastMessageIndexes,
            limit: limit + 1,
            ...filterParams,
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
    const items = pageRows.map(toDomainSession)
    const searchMatches = Object.fromEntries(
      pageRows.map((row) => [normalizeCHString(row.session_id), toSearchMatch(row)] as const),
    )

    const last = hasMore ? pageRows[pageRows.length - 1] : undefined
    if (!last) return { items, hasMore, searchMatches }
    const cursorRowKey: keyof SessionSearchRow = axis ? axis.rowKey : "best_score"
    return {
      items,
      hasMore,
      nextCursor: {
        sortValue: String(last[cursorRowKey]),
        secondaryValue: last.end_time,
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

export const countSessionsBySearchQuery = ({
  organizationId,
  projectId,
  parsed,
  filters,
}: CountSearchInput): Effect.Effect<SessionCountResult, RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
    const plan = yield* planSessionSearch(parsed)
    const { havingClauses, whereClauses, params: filterParams } = buildSearchFilters(filters)

    const candidates = yield* fetchSearchCandidates({ organizationId, projectId, plan })
    if (candidates.length === 0) return { totalCount: 0 } satisfies SessionCountResult

    const sessionIds = candidates.map((c) => normalizeCHString(c.session_id))
    const relevanceScores = candidates.map((c) => Number(c.relevance_score))
    const firstMessageIndexes = candidates.map((c) => c.matched_first_message_index ?? -1)
    const lastMessageIndexes = candidates.map((c) => c.matched_last_message_index ?? -1)
    const finalWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
    const finalHaving = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""

    return yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `WITH
                    mapFromArrays({sessionIds:Array(String)}, {relevanceScores:Array(Float64)}) AS scoreBySession,
                    mapFromArrays({sessionIds:Array(String)}, {firstMessageIndexes:Array(Int32)}) AS firstBySession,
                    mapFromArrays({sessionIds:Array(String)}, {lastMessageIndexes:Array(Int32)}) AS lastBySession
                  SELECT count() AS total
                  FROM (
                    SELECT ${SESSION_SEARCH_SELECT}
                    FROM sessions
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND session_id IN ({sessionIds:Array(String)})
                      ${finalWhere}
                    GROUP BY organization_id, project_id, session_id
                    ${finalHaving}
                  )`,
          query_params: {
            organizationId: organizationId as string,
            projectId: projectId as string,
            sessionIds,
            relevanceScores,
            firstMessageIndexes,
            lastMessageIndexes,
            ...filterParams,
          },
          format: "JSONEachRow",
        })
        return result.json<{ total: string }>()
      })
      .pipe(
        Effect.map((rows) => ({ totalCount: Number(rows[0]?.total ?? 0) })),
        Effect.mapError((error) => toRepositoryError(error, "countByProjectId")),
      )
  })
