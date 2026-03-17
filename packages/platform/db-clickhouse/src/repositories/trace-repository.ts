import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  SpanId,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
  TraceId as toTraceId,
} from "@domain/shared"
import type { Trace, TraceDetail, TraceStatus } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { Effect, Layer } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { buildFilters, type ColumnSchema } from "../filter-builder.ts"

const toClickhouseDateTime = (date: Date | undefined): string | undefined =>
  date ? date.toISOString().replace("Z", "") : undefined

const INT_TO_STATUS: Record<number, TraceStatus> = {
  0: "unset",
  1: "ok",
  2: "error",
}

/**
 * Maps Trace domain field names to ClickHouse expressions.
 *
 * WHERE fields: raw columns in the traces materialized-view rows.
 * HAVING fields: expressions that must be evaluated after GROUP BY aggregation.
 *
 * status values: 0 = unset, 1 = ok, 2 = error
 */
const TRACE_FILTER_SCHEMA = {
  traceId: { expr: "trace_id", kind: "string", clause: "where", chType: "String" },
  status: { expr: "overall_status", kind: "number", clause: "where", chType: "UInt8" },
  // DateTime64(9) defaults to UTC; avoids quotes in the type spec which confuse test param substitution
  startTime: { expr: "min_start_time", kind: "date", clause: "where", chType: "DateTime64(9)" },
  endTime: { expr: "max_end_time", kind: "date", clause: "where", chType: "DateTime64(9)" },
  spanCount: { expr: "sum(span_count)", kind: "number", clause: "having", chType: "UInt64" },
  errorCount: { expr: "sum(error_count)", kind: "number", clause: "having", chType: "UInt64" },
  durationNs: {
    expr: "reinterpretAsInt64(max(max_end_time)) - reinterpretAsInt64(min(min_start_time))",
    kind: "number",
    clause: "having",
    chType: "Int64",
  },
  tokensInput: { expr: "sum(tokens_input)", kind: "number", clause: "having", chType: "UInt64" },
  tokensOutput: { expr: "sum(tokens_output)", kind: "number", clause: "having", chType: "UInt64" },
  tokensCacheRead: { expr: "sum(tokens_cache_read)", kind: "number", clause: "having", chType: "UInt64" },
  tokensCacheCreate: { expr: "sum(tokens_cache_create)", kind: "number", clause: "having", chType: "UInt64" },
  tokensReasoning: { expr: "sum(tokens_reasoning)", kind: "number", clause: "having", chType: "UInt64" },
  tokensTotal: { expr: "sum(tokens_total)", kind: "number", clause: "having", chType: "UInt64" },
  costInputMicrocents: { expr: "sum(cost_input_microcents)", kind: "number", clause: "having", chType: "Int64" },
  costOutputMicrocents: { expr: "sum(cost_output_microcents)", kind: "number", clause: "having", chType: "Int64" },
  costTotalMicrocents: { expr: "sum(cost_total_microcents)", kind: "number", clause: "having", chType: "Int64" },
  tags: { expr: "tags", kind: "array", clause: "where", chType: "String" },
  models: { expr: "groupUniqArrayIfMerge(models)", kind: "array", clause: "having", chType: "String" },
  providers: { expr: "groupUniqArrayIfMerge(providers)", kind: "array", clause: "having", chType: "String" },
  serviceNames: {
    expr: "groupUniqArrayIfMerge(service_names)",
    kind: "array",
    clause: "having",
    chType: "String",
  },
  rootSpanName: { expr: "argMinIfMerge(root_span_name)", kind: "string", clause: "having", chType: "String" },
} satisfies ColumnSchema

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
  groupUniqArrayArray(tags)    AS tags,
  groupUniqArrayIfMerge(models)        AS models,
  groupUniqArrayIfMerge(providers)     AS providers,
  groupUniqArrayIfMerge(service_names) AS service_names,
  argMinIfMerge(root_span_id)   AS root_span_id,
  argMinIfMerge(root_span_name) AS root_span_name
`

const DETAIL_SELECT = `${LIST_SELECT},
  argMinIfMerge(input_messages)  AS input_messages,
  argMaxIfMerge(output_messages) AS output_messages
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
  tags: string[]
  models: string[]
  providers: string[]
  service_names: string[]
  root_span_id: string
  root_span_name: string
}

type TraceDetailRow = TraceListRow & {
  input_messages: string
  output_messages: string
}

const parseMessages = (json: string): GenAIMessage[] => {
  if (!json) return []
  try {
    return JSON.parse(json) as GenAIMessage[]
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
  tags: row.tags,
  models: row.models,
  providers: row.providers,
  serviceNames: row.service_names,
  rootSpanId: SpanId(row.root_span_id),
  rootSpanName: row.root_span_name,
})

const toDomainTraceDetail = (row: TraceDetailRow): TraceDetail => ({
  ...toBaseFields(row),
  inputMessages: parseMessages(row.input_messages),
  outputMessages: parseMessages(row.output_messages),
})

export const TraceRepositoryLive = Layer.effect(
  TraceRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      findByProjectId: ({ organizationId, projectId, options }) =>
        chSqlClient
          .query(async (client) => {
            const {
              whereFragments,
              havingFragments,
              params: filterParams,
            } = buildFilters(options.filters ?? [], TRACE_FILTER_SCHEMA)

            const extraWhere = whereFragments.length ? `AND ${whereFragments.join(" AND ")}` : ""
            const havingClause = havingFragments.length ? `HAVING ${havingFragments.join(" AND ")}` : ""

            const result = await client.query({
              query: `SELECT ${LIST_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND ({hasStartFrom:Bool} = false OR min_start_time >= {startTimeFrom:DateTime64(9, 'UTC')})
                        AND ({hasStartTo:Bool} = false OR min_start_time <= {startTimeTo:DateTime64(9, 'UTC')})
                        ${extraWhere}
                      GROUP BY organization_id, project_id, trace_id
                      ${havingClause}
                      ORDER BY start_time DESC
                      LIMIT {limit:UInt32}
                      OFFSET {offset:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                hasStartFrom: options.startTimeFrom !== undefined,
                startTimeFrom: toClickhouseDateTime(options.startTimeFrom) ?? "1970-01-01 00:00:00.000000000",
                hasStartTo: options.startTimeTo !== undefined,
                startTimeTo: toClickhouseDateTime(options.startTimeTo) ?? "2100-01-01 00:00:00.000000000",
                limit: options.limit ?? 50,
                offset: options.offset ?? 0,
                ...filterParams,
              },
              format: "JSONEachRow",
            })
            return result.json<TraceListRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toBaseFields)),
            Effect.mapError((error) => toRepositoryError(error, "findByProjectId")),
          ),

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
    }
  }),
)
