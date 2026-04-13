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
  TraceId as toTraceId,
} from "@domain/shared"
import type { Trace, TraceDetail, TraceListPage, TraceMetrics, TraceTimeHistogramBucket } from "@domain/spans"
import { emptyTraceMetrics, TraceRepository, type TraceRepositoryShape } from "@domain/spans"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { TRACE_FIELD_REGISTRY } from "../registries/trace-fields.ts"
import { buildScoreRollupSubquery, splitScoreFilters } from "../score-filter-subquery.ts"

const LIST_SELECT = `
  organization_id,
  project_id,
  trace_id,
  sum(span_count)              AS span_count,
  sum(error_count)             AS error_count,
  min(min_start_time)          AS start_time,
  max(max_end_time)            AS end_time,
  reinterpretAsInt64(max(max_end_time))
    - reinterpretAsInt64(min(min_start_time)) AS duration_ns,
  if(
    min(time_of_first_token) < toDateTime64('2261-01-01', 9, 'UTC'),
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
  argMaxIfMerge(session_id)    AS session_id,
  argMaxIfMerge(user_id)       AS user_id,
  groupUniqArrayArray(tags)    AS tags,
  maxMap(metadata)              AS metadata,
  argMaxIfMerge(simulation_id) AS simulation_id,
  groupUniqArrayIfMerge(models)        AS models,
  groupUniqArrayIfMerge(providers)     AS providers,
  groupUniqArrayIfMerge(service_names) AS service_names,
  argMinIfMerge(root_span_id)   AS root_span_id,
  argMinIfMerge(root_span_name) AS root_span_name
`

const DETAIL_SELECT = `${LIST_SELECT},
  argMinIfMerge(input_messages)        AS input_messages,
  argMaxIfMerge(last_input_messages)   AS last_input_messages,
  argMaxIfMerge(output_messages)       AS output_messages,
  argMinIfMerge(system_instructions)   AS system_instructions
`

type TraceListRow = {
  organization_id: string
  project_id: string
  trace_id: string
  span_count: string
  error_count: string
  start_time: string
  end_time: string
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
  session_id: string
  user_id: string
  simulation_id: string
  tags: string[]
  metadata: Record<string, string>
  models: string[]
  providers: string[]
  service_names: string[]
  root_span_id: string
  root_span_name: string
}

type TraceDetailRow = TraceListRow & {
  input_messages: string
  last_input_messages: string
  output_messages: string
  system_instructions: string
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

const toBaseFields = (row: TraceListRow): Trace => ({
  organizationId: toOrganizationId(normalizeCHString(row.organization_id)),
  projectId: toProjectId(normalizeCHString(row.project_id)),
  traceId: toTraceId(normalizeCHString(row.trace_id)),
  spanCount: Number(row.span_count),
  errorCount: Number(row.error_count),
  startTime: parseCHDate(row.start_time),
  endTime: parseCHDate(row.end_time),
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
  sessionId: SessionId(normalizeCHString(row.session_id)),
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

type TraceMetricsRow = {
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
  tokens_min: string
  tokens_max: string
  tokens_avg: string
  tokens_median: string
  tokens_sum: string
  ttft_min: string
  ttft_max: string
  ttft_avg: string
  ttft_median: string
  ttft_sum: string
}

const toNumericRollup = (min: string, max: string, avg: string, median: string, sum: string) => ({
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

const toTtftRollup = (row: TraceMetricsRow) => ({
  min: finiteOrZero(row.ttft_min),
  max: finiteOrZero(row.ttft_max),
  avg: finiteOrZero(row.ttft_avg),
  median: finiteOrZero(row.ttft_median),
  sum: finiteOrZero(row.ttft_sum),
})

const toTraceMetrics = (row: TraceMetricsRow | undefined): TraceMetrics => {
  if (!row || Number(row.row_count) === 0) return emptyTraceMetrics()
  return {
    durationNs: toNumericRollup(
      row.duration_min,
      row.duration_max,
      row.duration_avg,
      row.duration_median,
      row.duration_sum,
    ),
    costTotalMicrocents: toNumericRollup(row.cost_min, row.cost_max, row.cost_avg, row.cost_median, row.cost_sum),
    spanCount: toNumericRollup(row.span_min, row.span_max, row.span_avg, row.span_median, row.span_sum),
    tokensTotal: toNumericRollup(row.tokens_min, row.tokens_max, row.tokens_avg, row.tokens_median, row.tokens_sum),
    timeToFirstTokenNs: toTtftRollup(row),
  }
}

const toDomainTraceDetail = (row: TraceDetailRow): TraceDetail => {
  const lastInput = parseMessages(row.last_input_messages)
  const output = parseMessages(row.output_messages)
  return {
    ...toBaseFields(row),
    systemInstructions: parseSystem(row.system_instructions),
    inputMessages: parseMessages(row.input_messages),
    outputMessages: output,
    allMessages: [...lastInput, ...output],
  }
}

interface SortColumn {
  readonly expr: string
  readonly chType: string
  readonly rowKey: keyof TraceListRow
}

const SORT_COLUMNS: Record<string, SortColumn> = {
  startTime: { expr: "start_time", chType: "DateTime64(9, 'UTC')", rowKey: "start_time" },
  duration: { expr: "duration_ns", chType: "Int64", rowKey: "duration_ns" },
  ttft: { expr: "time_to_first_token_ns", chType: "Int64", rowKey: "time_to_first_token_ns" },
  cost: { expr: "cost_total_microcents", chType: "UInt64", rowKey: "cost_total_microcents" },
  spans: { expr: "span_count", chType: "UInt64", rowKey: "span_count" },
}

function buildTraceFilterClauses(
  filters: FilterSet | undefined,
  options?: {
    readonly paramPrefix?: string
  },
): {
  /** HAVING clauses for the trace GROUP BY. */
  havingClauses: string[]
  /** WHERE clauses to add before GROUP BY (e.g. score subquery). */
  whereClauses: string[]
  params: Record<string, unknown>
} {
  if (!filters || Object.keys(filters).length === 0) {
    return { havingClauses: [], whereClauses: [], params: {} }
  }

  const { telemetryFilters, scoreFilters } = splitScoreFilters(filters)

  const telemetry = telemetryFilters
    ? buildClickHouseWhere(
        telemetryFilters,
        TRACE_FIELD_REGISTRY,
        options?.paramPrefix ? { paramPrefix: options.paramPrefix } : undefined,
      )
    : { clauses: [], params: {} }

  let whereClauses: string[] = []
  let scoreParams: Record<string, unknown> = {}

  if (scoreFilters) {
    const result = buildScoreRollupSubquery(
      "trace_id",
      scoreFilters,
      false,
      options?.paramPrefix ? { paramPrefix: `${options.paramPrefix}_s` } : undefined,
    )
    whereClauses = [result.subquery]
    scoreParams = result.params
  }

  return {
    havingClauses: telemetry.clauses,
    whereClauses,
    params: { ...telemetry.params, ...scoreParams },
  }
}

function buildTraceFilterCondition(
  filters: FilterSet | undefined,
  paramPrefix: string,
): {
  condition: string
  params: Record<string, unknown>
} {
  const { havingClauses, whereClauses, params } = buildTraceFilterClauses(filters, { paramPrefix })
  const clauses = [...whereClauses, ...havingClauses]

  return {
    condition: clauses.length > 0 ? clauses.map((clause) => `(${clause})`).join(" AND ") : "1",
    params,
  }
}

const DEFAULT_SORT: SortColumn = SORT_COLUMNS.startTime as SortColumn

export const TraceRepositoryLive = Layer.effect(
  TraceRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const listByProjectId: TraceRepositoryShape["listByProjectId"] = ({ organizationId, projectId, options }) => {
      const sort = SORT_COLUMNS[options.sortBy ?? ""] ?? DEFAULT_SORT
      const orderDir = options.sortDirection === "asc" ? "ASC" : "DESC"
      const cmp = orderDir === "DESC" ? "<" : ">"
      const limit = options.limit ?? 50

      const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(options.filters)

      const havingParts: string[] = [...havingClauses]
      if (options.cursor) {
        havingParts.push(
          `(${sort.expr} ${cmp} {cursorSortValue:${sort.chType}}
              OR (${sort.expr} = {cursorSortValue:${sort.chType}}
                  AND trace_id ${cmp} {cursorTraceId:FixedString(32)}))`,
        )
      }
      const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : ""
      const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT ${LIST_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        ${extraWhere}
                      GROUP BY organization_id, project_id, trace_id
                      ${havingClause}
                      ORDER BY ${sort.expr} ${orderDir}, trace_id ${orderDir}
                      LIMIT {limit:UInt32}`,
            query_params: {
              organizationId: organizationId as string,
              projectId: projectId as string,
              limit: limit + 1,
              ...filterParams,
              ...(options.cursor
                ? {
                    cursorSortValue: options.cursor.sortValue,
                    cursorTraceId: options.cursor.traceId,
                  }
                : {}),
            },
            format: "JSONEachRow",
          })
          return result.json<TraceListRow>()
        })
        .pipe(
          Effect.map((rows): TraceListPage => {
            const hasMore = rows.length > limit
            const pageRows = hasMore ? rows.slice(0, limit) : rows
            const items = pageRows.map(toBaseFields)
            const last = hasMore ? pageRows[pageRows.length - 1] : undefined
            if (!last) return { items, hasMore }
            return {
              items,
              hasMore,
              nextCursor: { sortValue: String(last[sort.rowKey]), traceId: last.trace_id },
            }
          }),
          Effect.mapError((error) => toRepositoryError(error, "listByProjectId")),
        )
    }

    const listByTraceIds: TraceRepositoryShape["listByTraceIds"] = ({ organizationId, projectId, traceIds }) => {
      if (traceIds.length === 0) return Effect.succeed([])

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT ${DETAIL_SELECT}
                    FROM traces
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND trace_id IN ({traceIds:Array(String)})
                    GROUP BY organization_id, project_id, trace_id`,
            query_params: {
              organizationId: organizationId as string,
              projectId: projectId as string,
              traceIds: Array.from(traceIds) as string[],
            },
            format: "JSONEachRow",
          })
          return result.json<TraceDetailRow>()
        })
        .pipe(
          Effect.map((rows) => rows.map(toDomainTraceDetail)),
          Effect.mapError((error) => toRepositoryError(error, "listByTraceIds")),
        )
    }

    const matchesFiltersByTraceId: TraceRepositoryShape["matchesFiltersByTraceId"] = ({
      organizationId,
      projectId,
      traceId,
      filters,
    }) => {
      const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
      const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
      const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT count() AS total
                    FROM (
                      SELECT ${LIST_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id = {traceId:FixedString(32)}
                        ${extraWhere}
                      GROUP BY organization_id, project_id, trace_id
                      ${havingClause}
                      LIMIT 1
                    )`,
            query_params: {
              organizationId: organizationId as string,
              projectId: projectId as string,
              traceId,
              ...filterParams,
            },
            format: "JSONEachRow",
          })
          return result.json<{ total: string }>()
        })
        .pipe(
          Effect.map((rows) => Number(rows[0]?.total ?? 0) > 0),
          Effect.mapError((error) => toRepositoryError(error, "matchesFiltersByTraceId")),
        )
    }

    const listMatchingFilterIdsByTraceId: TraceRepositoryShape["listMatchingFilterIdsByTraceId"] = ({
      organizationId,
      projectId,
      traceId,
      filterSets,
    }) => {
      if (filterSets.length === 0) {
        return Effect.succeed([])
      }

      const queryParams: Record<string, unknown> = {
        organizationId: organizationId as string,
        projectId: projectId as string,
        traceId,
      }

      const matchExpressions = filterSets.map(({ filterId, filters }, index) => {
        const { condition, params } = buildTraceFilterCondition(filters, `batch_${index}`)
        const filterIdParam = `filter_id_${index}`

        Object.assign(queryParams, params, { [filterIdParam]: filterId })

        return `if(${condition}, {${filterIdParam}:String}, '')`
      })

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT matched_filter_id
                    FROM (
                      SELECT arrayJoin([
                        ${matchExpressions.join(",\n                        ")}
                      ]) AS matched_filter_id
                      FROM (
                        SELECT ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND trace_id = {traceId:FixedString(32)}
                        GROUP BY organization_id, project_id, trace_id
                        LIMIT 1
                      )
                    )
                    WHERE matched_filter_id != ''`,
            query_params: queryParams,
            format: "JSONEachRow",
          })
          return result.json<{ matched_filter_id: string }>()
        })
        .pipe(
          Effect.map((rows) => rows.map((row) => row.matched_filter_id)),
          Effect.mapError((error) => toRepositoryError(error, "listMatchingFilterIdsByTraceId")),
        )
    }

    return {
      listByProjectId,

      countByProjectId: ({ organizationId, projectId, filters }) => {
        const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
        const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
        const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT count() AS total
                      FROM (
                        SELECT ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, trace_id
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
      },

      aggregateMetricsByProjectId: ({ organizationId, projectId, filters }) => {
        const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
        const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
        const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

        return chSqlClient
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
                        min(tokens_total) AS tokens_min,
                        max(tokens_total) AS tokens_max,
                        avg(tokens_total) AS tokens_avg,
                        quantileTDigest(0.5)(tokens_total) AS tokens_median,
                        sum(tokens_total) AS tokens_sum,
                        minIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_min,
                        maxIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_max,
                        avgIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_avg,
                        quantileTDigestIf(0.5)(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_median,
                        sumIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_sum
                      FROM (
                        SELECT ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, trace_id
                        ${havingClause}
                      )`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                ...filterParams,
              },
              format: "JSONEachRow",
            })
            return result.json<TraceMetricsRow>()
          })
          .pipe(
            Effect.map((rows) => toTraceMetrics(rows[0])),
            Effect.mapError((error) => toRepositoryError(error, "aggregateMetricsByProjectId")),
          )
      },

      histogramByProjectId: ({ organizationId, projectId, filters, bucketSeconds }) => {
        const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
        const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
        const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
        const bs = Math.floor(bucketSeconds)

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        toDateTime(
                          intDiv(toUnixTimestamp(start_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                          'UTC'
                        ) AS bucket_start,
                        count() AS trace_count
                      FROM (
                        SELECT ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, trace_id
                        ${havingClause}
                      )
                      GROUP BY bucket_start
                      ORDER BY bucket_start ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                bucketSeconds: bs,
                ...filterParams,
              },
              format: "JSONEachRow",
            })
            return result.json<{ bucket_start: string; trace_count: string }>()
          })
          .pipe(
            Effect.map((rows): readonly TraceTimeHistogramBucket[] =>
              rows.map((row) => ({
                bucketStart: parseCHDate(row.bucket_start).toISOString(),
                traceCount: Number(row.trace_count),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "histogramByProjectId")),
          )
      },

      findByTraceId: ({ organizationId, projectId, traceId }) =>
        chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${DETAIL_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id = {traceId:FixedString(32)}
                      GROUP BY organization_id, project_id, trace_id
                      LIMIT 1`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                traceId,
              },
              format: "JSONEachRow",
            })
            return result.json<TraceDetailRow>()
          })
          .pipe(
            Effect.flatMap((rows) => {
              const first = rows[0]
              if (!first) {
                return Effect.fail(new NotFoundError({ entity: "Trace", id: traceId as string }))
              }
              return Effect.succeed(toDomainTraceDetail(first))
            }),
            Effect.mapError((error) => (isNotFoundError(error) ? error : toRepositoryError(error, "findByTraceId"))),
          ),

      matchesFiltersByTraceId,

      listMatchingFilterIdsByTraceId,

      listByTraceIds,

      distinctFilterValues: ({ organizationId, projectId, column, limit: maxValues, search }) => {
        const COLUMN_EXPRS: Record<string, string> = {
          tags: "arrayJoin(groupUniqArrayArray(tags))",
          models: "arrayJoin(groupUniqArrayIfMerge(models))",
          providers: "arrayJoin(groupUniqArrayIfMerge(providers))",
          serviceNames: "arrayJoin(groupUniqArrayIfMerge(service_names))",
        }
        const expr = COLUMN_EXPRS[column]
        if (!expr) return Effect.succeed([])

        const searchClause = search ? " AND val ILIKE {search:String}" : ""

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT DISTINCT val FROM (
                        SELECT ${expr} AS val
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        GROUP BY organization_id, project_id, trace_id
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
      },
    }
  }),
)
