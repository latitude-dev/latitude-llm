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

const toClickhouseDateTime = (date: Date | undefined): string | undefined =>
  date ? date.toISOString().replace("Z", "") : undefined

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
            const result = await client.query({
              query: `SELECT ${LIST_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND ({hasTraceId:Bool} = false OR trace_id LIKE {traceIdPattern:String})
                        AND ({hasStartFrom:Bool} = false OR min_start_time >= {startTimeFrom:DateTime64(9, 'UTC')})
                        AND ({hasStartTo:Bool} = false OR min_start_time <= {startTimeTo:DateTime64(9, 'UTC')})
                      GROUP BY organization_id, project_id, trace_id
                      ORDER BY start_time DESC
                      LIMIT {limit:UInt32}
                      OFFSET {offset:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                hasTraceId: options.traceId !== undefined && options.traceId !== "",
                traceIdPattern: options.traceId ? `%${options.traceId}%` : "%",
                hasStartFrom: options.startTimeFrom !== undefined,
                startTimeFrom: toClickhouseDateTime(options.startTimeFrom) ?? "1970-01-01 00:00:00.000000000",
                hasStartTo: options.startTimeTo !== undefined,
                startTimeTo: toClickhouseDateTime(options.startTimeTo) ?? "2100-01-01 00:00:00.000000000",
                limit: options.limit ?? 50,
                offset: options.offset ?? 0,
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
    }
  }),
)
