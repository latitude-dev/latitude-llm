import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  type FilterSet,
  SessionId,
  SpanId,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
  TraceId as toTraceId,
} from "@domain/shared"
import type { Trace, TraceDetail, TraceListPage, TraceStatus } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { TRACE_FIELD_REGISTRY } from "../registries/trace-fields.ts"

const INT_TO_STATUS: Record<number, TraceStatus> = {
  0: "unset",
  1: "ok",
  2: "error",
}

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
  max(overall_status)          AS overall_status,
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
  overall_status: number
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
  organizationId: toOrganizationId(row.organization_id),
  projectId: toProjectId(row.project_id),
  traceId: toTraceId(row.trace_id),
  spanCount: Number(row.span_count),
  errorCount: Number(row.error_count),
  startTime: new Date(row.start_time),
  endTime: new Date(row.end_time),
  durationNs: Number(row.duration_ns),
  status: INT_TO_STATUS[row.overall_status] ?? ("unset" as const),
  tokensInput: Number(row.tokens_input),
  tokensOutput: Number(row.tokens_output),
  tokensCacheRead: Number(row.tokens_cache_read),
  tokensCacheCreate: Number(row.tokens_cache_create),
  tokensReasoning: Number(row.tokens_reasoning),
  tokensTotal: Number(row.tokens_total),
  costInputMicrocents: Number(row.cost_input_microcents),
  costOutputMicrocents: Number(row.cost_output_microcents),
  costTotalMicrocents: Number(row.cost_total_microcents),
  sessionId: SessionId(row.session_id ?? ""),
  userId: ExternalUserId(row.user_id ?? ""),
  tags: row.tags,
  metadata: row.metadata ?? {},
  models: row.models,
  providers: row.providers,
  serviceNames: row.service_names,
  rootSpanId: SpanId(row.root_span_id),
  rootSpanName: row.root_span_name,
})

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
  cost: { expr: "cost_total_microcents", chType: "UInt64", rowKey: "cost_total_microcents" },
  spans: { expr: "span_count", chType: "UInt64", rowKey: "span_count" },
}

function buildTraceFilterClauses(filters: FilterSet | undefined): {
  clauses: string[]
  params: Record<string, unknown>
} {
  if (!filters || Object.keys(filters).length === 0) {
    return { clauses: [], params: {} }
  }
  return buildClickHouseWhere(filters, TRACE_FIELD_REGISTRY)
}

const DEFAULT_SORT: SortColumn = SORT_COLUMNS.startTime as SortColumn

export const TraceRepositoryLive = Layer.effect(
  TraceRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      findByProjectId: ({ organizationId, projectId, options }) => {
        const sort = SORT_COLUMNS[options.sortBy ?? ""] ?? DEFAULT_SORT
        const orderDir = options.sortDirection === "asc" ? "ASC" : "DESC"
        const cmp = orderDir === "DESC" ? "<" : ">"
        const limit = options.limit ?? 50

        const { clauses: filterClauses, params: filterParams } = buildTraceFilterClauses(options.filters)

        const havingParts: string[] = [...filterClauses]
        if (options.cursor) {
          havingParts.push(
            `(${sort.expr} ${cmp} {cursorSortValue:${sort.chType}}
              OR (${sort.expr} = {cursorSortValue:${sort.chType}}
                  AND trace_id ${cmp} {cursorTraceId:FixedString(32)}))`,
          )
        }
        const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : ""

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${LIST_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
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
            Effect.mapError((error) => toRepositoryError(error, "findByProjectId")),
          )
      },

      countByProjectId: ({ organizationId, projectId, filters }) => {
        const { clauses: filterClauses, params: filterParams } = buildTraceFilterClauses(filters)
        const havingClause = filterClauses.length > 0 ? `HAVING ${filterClauses.join(" AND ")}` : ""

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT count() AS total
                      FROM (
                        SELECT trace_id, ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
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
            Effect.map((rows) => {
              const first = rows[0]
              return first ? toDomainTraceDetail(first) : null
            }),
            Effect.mapError((error) => toRepositoryError(error, "findByTraceId")),
          ),

      findByTraceIds: ({ organizationId, projectId, traceIds }) => {
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
            Effect.mapError((error) => toRepositoryError(error, "findByTraceIds")),
          )
      },

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
