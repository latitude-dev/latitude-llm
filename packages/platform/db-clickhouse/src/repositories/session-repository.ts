import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  type FilterSet,
  isNotFoundError,
  NotFoundError,
  SessionId,
  SimulationId,
  SpanId,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
} from "@domain/shared"
import type { Session, SessionDetail, SessionListPage, SessionMetrics } from "@domain/spans"
import { emptySessionMetrics, SessionRepository, type SessionRepositoryShape } from "@domain/spans"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { SESSION_FIELD_REGISTRY } from "../registries/session-fields.ts"
import { buildScoreRollupSubquery, splitScoreFilters } from "../score-filter-subquery.ts"

const LIST_SELECT = `
  organization_id,
  project_id,
  session_id,
  uniqExactMerge(trace_count)  AS trace_count,
  groupUniqArrayMerge(trace_ids) AS trace_ids,
  sum(span_count)              AS span_count,
  sum(error_count)             AS error_count,
  min(min_start_time)          AS start_time,
  max(max_end_time)            AS end_time,
  -- max_start_time was added by migration 00016 without a DEFAULT, so
  -- session parts ingested before the migration read back as the DateTime64
  -- zero (1970-01-01). Detect that sentinel by comparing against the
  -- session's own min_start_time and fall back to max_end_time so legacy
  -- rows still sort/display by their last known activity.
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
  argMinIfMerge(root_span_name)        AS root_span_name
`

const DETAIL_SELECT = `${LIST_SELECT},
  argMinIfMerge(input_messages)        AS input_messages,
  argMaxIfMerge(last_input_messages)   AS last_input_messages,
  argMaxIfMerge(output_messages)       AS output_messages,
  argMinIfMerge(system_instructions)   AS system_instructions
`

type SessionListRow = {
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
}

type SessionDetailRow = SessionListRow & {
  input_messages: string
  last_input_messages: string
  output_messages: string
  system_instructions: string
}

type SessionMetricsRow = {
  row_count: string
  duration_min: string
  duration_max: string
  duration_avg: string
  duration_median: string
  duration_sum: string
  cost_min: string
  cost_max: string
  cost_avg: string
  cost_median: string
  cost_sum: string
  span_min: string
  span_max: string
  span_avg: string
  span_median: string
  span_sum: string
  ttft_min: string
  ttft_max: string
  ttft_avg: string
  ttft_median: string
  ttft_sum: string
}

const toSessionNumericRollup = (min: string, max: string, avg: string, median: string, sum: string) => ({
  min: Number(min),
  max: Number(max),
  avg: Number(avg),
  median: Number(median),
  sum: Number(sum),
})

/** TTFT uses 0 as sentinel for "no first token"; aggregates only consider rows with TTFT > 0. */
const finiteOrZero = (raw: string): number => {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

const toTtftRollup = (row: SessionMetricsRow) => ({
  min: finiteOrZero(row.ttft_min),
  max: finiteOrZero(row.ttft_max),
  avg: finiteOrZero(row.ttft_avg),
  median: finiteOrZero(row.ttft_median),
  sum: finiteOrZero(row.ttft_sum),
})

const toSessionMetrics = (row: SessionMetricsRow | undefined): SessionMetrics => {
  if (!row || Number(row.row_count) === 0) return emptySessionMetrics()
  return {
    durationNs: toSessionNumericRollup(
      row.duration_min,
      row.duration_max,
      row.duration_avg,
      row.duration_median,
      row.duration_sum,
    ),
    costTotalMicrocents: toSessionNumericRollup(
      row.cost_min,
      row.cost_max,
      row.cost_avg,
      row.cost_median,
      row.cost_sum,
    ),
    spanCount: toSessionNumericRollup(row.span_min, row.span_max, row.span_avg, row.span_median, row.span_sum),
    timeToFirstTokenNs: toTtftRollup(row),
  }
}

const parseMessages = (json: string): GenAIMessage[] => {
  if (!json) return []
  try {
    return JSON.parse(json) as GenAIMessage[]
  } catch {
    return []
  }
}

const parseSystem = (json: string): GenAISystem => {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as GenAISystem) : []
  } catch {
    return []
  }
}

const toDomainSession = (row: SessionListRow): Session => ({
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

const toDomainSessionDetail = (row: SessionDetailRow): SessionDetail => ({
  ...toDomainSession(row),
  systemInstructions: parseSystem(row.system_instructions),
  inputMessages: parseMessages(row.input_messages),
  lastInputMessages: parseMessages(row.last_input_messages),
  outputMessages: parseMessages(row.output_messages),
})

interface SortColumn {
  readonly expr: string
  readonly chType: string
  readonly rowKey: keyof SessionListRow
}

const SORT_COLUMNS: Record<string, SortColumn> = {
  lastActivity: { expr: "last_activity_time", chType: "DateTime64(9, 'UTC')", rowKey: "last_activity_time" },
  startTime: { expr: "start_time", chType: "DateTime64(9, 'UTC')", rowKey: "start_time" },
  duration: { expr: "duration_ns", chType: "Int64", rowKey: "duration_ns" },
  ttft: { expr: "time_to_first_token_ns", chType: "Int64", rowKey: "time_to_first_token_ns" },
  cost: { expr: "cost_total_microcents", chType: "UInt64", rowKey: "cost_total_microcents" },
  spans: { expr: "span_count", chType: "UInt64", rowKey: "span_count" },
  traceCount: { expr: "trace_count", chType: "UInt64", rowKey: "trace_count" },
}

function buildSessionFilterClauses(filters: FilterSet | undefined): {
  havingClauses: string[]
  whereClauses: string[]
  params: Record<string, unknown>
} {
  if (!filters || Object.keys(filters).length === 0) {
    return { havingClauses: [], whereClauses: [], params: {} }
  }

  const { telemetryFilters, scoreFilters } = splitScoreFilters(filters)

  const telemetry = telemetryFilters
    ? buildClickHouseWhere(telemetryFilters, SESSION_FIELD_REGISTRY)
    : { clauses: [], params: {} }

  let whereClauses: string[] = []
  let scoreParams: Record<string, unknown> = {}

  if (scoreFilters) {
    const result = buildScoreRollupSubquery("session_id", scoreFilters, false)
    whereClauses = [result.subquery]
    scoreParams = result.params
  }

  return {
    havingClauses: telemetry.clauses,
    whereClauses,
    params: { ...telemetry.params, ...scoreParams },
  }
}

const DEFAULT_SORT: SortColumn = SORT_COLUMNS.lastActivity as SortColumn

export const SessionRepositoryLive = Layer.effect(
  SessionRepository,
  Effect.gen(function* () {
    const listByProjectId: SessionRepositoryShape["listByProjectId"] = ({ organizationId, projectId, options }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const sort = SORT_COLUMNS[options.sortBy ?? ""] ?? DEFAULT_SORT
        const orderDir = options.sortDirection === "asc" ? "ASC" : "DESC"
        const cmp = orderDir === "DESC" ? "<" : ">"
        const limit = options.limit ?? 50

        const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(options.filters)

        const havingParts: string[] = [...havingClauses]
        if (options.cursor) {
          havingParts.push(
            `(${sort.expr} ${cmp} {cursorSortValue:${sort.chType}}
                OR (${sort.expr} = {cursorSortValue:${sort.chType}}
                    AND session_id ${cmp} {cursorSessionId:String}))`,
          )
        }
        const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : ""
        const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${LIST_SELECT}
                      FROM sessions
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        ${extraWhere}
                      GROUP BY organization_id, project_id, session_id
                      ${havingClause}
                      ORDER BY ${sort.expr} ${orderDir}, session_id ${orderDir}
                      LIMIT {limit:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                limit: limit + 1,
                ...filterParams,
                ...(options.cursor
                  ? {
                      cursorSortValue: options.cursor.sortValue,
                      cursorSessionId: options.cursor.sessionId,
                    }
                  : {}),
              },
              format: "JSONEachRow",
            })
            return result.json<SessionListRow>()
          })
          .pipe(
            Effect.map((rows): SessionListPage => {
              const hasMore = rows.length > limit
              const pageRows = hasMore ? rows.slice(0, limit) : rows
              const items = pageRows.map(toDomainSession)
              const last = hasMore ? pageRows[pageRows.length - 1] : undefined
              if (!last) return { items, hasMore }
              return {
                items,
                hasMore,
                nextCursor: { sortValue: String(last[sort.rowKey]), sessionId: last.session_id },
              }
            }),
            Effect.mapError((error) => toRepositoryError(error, "listByProjectId")),
          )
      })

    return {
      listByProjectId,

      countByProjectId: ({ organizationId, projectId, filters }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(filters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT count() AS total
                      FROM (
                        SELECT session_id, ${LIST_SELECT}
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, session_id
                        ${havingClause}
                      )`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              return result.json<{ total: string }>()
            })
            .pipe(
              Effect.map((rows) => Number(rows[0]?.total ?? 0)),
              Effect.mapError((error) => toRepositoryError(error, "countByProjectId")),
            )
        }),

      aggregateMetricsByProjectId: ({ organizationId, projectId, filters }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(filters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        count() AS row_count,
                        min(duration_ns) AS duration_min,
                        max(duration_ns) AS duration_max,
                        avg(duration_ns) AS duration_avg,
                        quantileTDigest(0.5)(duration_ns) AS duration_median,
                        sum(duration_ns) AS duration_sum,
                        min(cost_total_microcents) AS cost_min,
                        max(cost_total_microcents) AS cost_max,
                        avg(cost_total_microcents) AS cost_avg,
                        quantileTDigest(0.5)(cost_total_microcents) AS cost_median,
                        sum(cost_total_microcents) AS cost_sum,
                        min(span_count) AS span_min,
                        max(span_count) AS span_max,
                        avg(span_count) AS span_avg,
                        quantileTDigest(0.5)(span_count) AS span_median,
                        sum(span_count) AS span_sum,
                        minIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_min,
                        maxIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_max,
                        avgIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_avg,
                        quantileTDigestIf(0.5)(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_median,
                        sumIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_sum
                      FROM (
                        SELECT session_id, ${LIST_SELECT}
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, session_id
                        ${havingClause}
                      )`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              return result.json<SessionMetricsRow>()
            })
            .pipe(
              Effect.map((rows) => toSessionMetrics(rows[0])),
              Effect.mapError((error) => toRepositoryError(error, "aggregateMetricsByProjectId")),
            )
        }),

      findBySessionId: ({ organizationId, projectId, sessionId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${DETAIL_SELECT}
                      FROM sessions
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND session_id = {sessionId:String}
                      GROUP BY organization_id, project_id, session_id
                      LIMIT 1`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  sessionId: sessionId as string,
                },
                format: "JSONEachRow",
              })
              return result.json<SessionDetailRow>()
            })
            .pipe(
              Effect.flatMap((rows) => {
                const first = rows[0]
                if (!first) {
                  return Effect.fail(new NotFoundError({ entity: "Session", id: sessionId as string }))
                }
                return Effect.succeed(toDomainSessionDetail(first))
              }),
              Effect.mapError((error) =>
                isNotFoundError(error) ? error : toRepositoryError(error, "findBySessionId"),
              ),
            )
        }),

      distinctFilterValues: ({ organizationId, projectId, column, limit: maxValues, search }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const COLUMN_EXPRS: Record<string, string> = {
            tags: "arrayJoin(groupUniqArrayArray(tags))",
            models: "arrayJoin(groupUniqArrayIfMerge(models))",
            providers: "arrayJoin(groupUniqArrayIfMerge(providers))",
            serviceNames: "arrayJoin(groupUniqArrayIfMerge(service_names))",
          }
          const expr = COLUMN_EXPRS[column]
          if (!expr) return []

          const searchClause = search ? " AND val ILIKE {search:String}" : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT DISTINCT val FROM (
                        SELECT ${expr} AS val
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        GROUP BY organization_id, project_id, session_id
                      )
                      WHERE val != ''${searchClause}
                      ORDER BY val
                      LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  limit: maxValues ?? 50,
                  ...(search ? { search: `%${search}%` } : {}),
                },
                format: "JSONEachRow",
              })
              return result.json<{ val: string }>()
            })
            .pipe(
              Effect.map((rows) => rows.map((r) => r.val)),
              Effect.mapError((error) => toRepositoryError(error, "distinctFilterValues")),
            )
        }),
    }
  }),
)
