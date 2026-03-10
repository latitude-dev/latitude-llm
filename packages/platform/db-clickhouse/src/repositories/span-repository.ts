import type { ClickHouseClient } from "@clickhouse/client"
import {
  SessionId,
  SpanId,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
  TraceId as toTraceId,
} from "@domain/shared"
import type { Span, SpanDetail, SpanKind, SpanRepository, SpanStatusCode } from "@domain/spans"
import { Effect } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { insertJsonEachRow, queryClickhouse } from "../sql.ts"

// ClickHouse DateTime64(9, 'UTC') rejects trailing 'Z'; strip it.
const toClickhouseDateTime = (date: Date | undefined): string | undefined =>
  date ? date.toISOString().replace("Z", "") : undefined

const SPAN_KIND_TO_INT: Record<SpanKind, number> = {
  unspecified: 0,
  internal: 1,
  server: 2,
  client: 3,
  producer: 4,
  consumer: 5,
}

const INT_TO_SPAN_KIND: Record<number, SpanKind> = {
  0: "unspecified",
  1: "internal",
  2: "server",
  3: "client",
  4: "producer",
  5: "consumer",
}

const STATUS_CODE_TO_INT: Record<SpanStatusCode, number> = {
  unset: 0,
  ok: 1,
  error: 2,
}

const INT_TO_STATUS_CODE: Record<number, SpanStatusCode> = {
  0: "unset",
  1: "ok",
  2: "error",
}

// Columns selected for list/trace queries (excludes large blob payloads).
const LIST_COLUMNS = `
  organization_id, project_id, session_id, trace_id, span_id,
  parent_span_id, api_key_id, start_time, end_time,
  name, service_name, kind, status_code, status_message,
  trace_flags, trace_state, error_type, tags,
  events_json, links_json,
  operation, provider, model, response_model,
  tokens_input, tokens_output, tokens_cache_read,
  tokens_cache_create, tokens_reasoning,
  cost_input_microcents, cost_output_microcents,
  cost_total_microcents, cost_is_estimated,
  response_id, finish_reasons,
  attr_string, attr_int, attr_float, attr_bool,
  resource_string, scope_name, scope_version,
  ingested_at
`

type SpanListRow = {
  organization_id: string
  project_id: string
  session_id: string
  trace_id: string
  span_id: string
  parent_span_id: string
  api_key_id: string
  start_time: string
  end_time: string
  name: string
  service_name: string
  kind: number
  status_code: number
  status_message: string
  trace_flags: number
  trace_state: string
  error_type: string
  tags: string[]
  events_json: string
  links_json: string
  operation: string
  provider: string
  model: string
  response_model: string
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create: number
  tokens_reasoning: number
  cost_input_microcents: string
  cost_output_microcents: string
  cost_total_microcents: string
  cost_is_estimated: number
  response_id: string
  finish_reasons: string[]
  attr_string: Record<string, string>
  attr_int: Record<string, number>
  attr_float: Record<string, number>
  attr_bool: Record<string, number>
  resource_string: Record<string, string>
  scope_name: string
  scope_version: string
  ingested_at: string
}

type SpanDetailRow = SpanListRow & {
  input_messages: string
  output_messages: string
  system_instructions: string
  tool_definitions: string
}

const toBaseFields = (row: SpanListRow) => ({
  organizationId: toOrganizationId(row.organization_id),
  projectId: toProjectId(row.project_id),
  sessionId: SessionId(row.session_id),
  traceId: toTraceId(row.trace_id),
  spanId: SpanId(row.span_id),
  parentSpanId: row.parent_span_id,
  apiKeyId: row.api_key_id,
  startTime: new Date(row.start_time),
  endTime: new Date(row.end_time),
  name: row.name,
  serviceName: row.service_name,
  kind: INT_TO_SPAN_KIND[row.kind] ?? ("unspecified" as const),
  statusCode: INT_TO_STATUS_CODE[row.status_code] ?? ("unset" as const),
  statusMessage: row.status_message,
  traceFlags: row.trace_flags,
  traceState: row.trace_state,
  errorType: row.error_type,
  tags: row.tags,
  eventsJson: row.events_json,
  linksJson: row.links_json,
  operation: row.operation,
  provider: row.provider,
  model: row.model,
  responseModel: row.response_model,
  tokensInput: row.tokens_input,
  tokensOutput: row.tokens_output,
  tokensCacheRead: row.tokens_cache_read,
  tokensCacheCreate: row.tokens_cache_create,
  tokensReasoning: row.tokens_reasoning,
  costInputMicrocents: Number(row.cost_input_microcents),
  costOutputMicrocents: Number(row.cost_output_microcents),
  costTotalMicrocents: Number(row.cost_total_microcents),
  costIsEstimated: row.cost_is_estimated !== 0,
  responseId: row.response_id,
  finishReasons: row.finish_reasons,
  attrString: row.attr_string,
  attrInt: row.attr_int,
  attrFloat: row.attr_float,
  attrBool: Object.fromEntries(Object.entries(row.attr_bool).map(([k, v]) => [k, v !== 0])),
  resourceString: row.resource_string,
  scopeName: row.scope_name,
  scopeVersion: row.scope_version,
  ingestedAt: new Date(row.ingested_at),
})

const toDomainSpan = (row: SpanListRow): Span => toBaseFields(row)

const parseMessages = (json: string): GenAIMessage[] => {
  if (!json) return []
  try {
    return JSON.parse(json) as GenAIMessage[]
  } catch {
    return []
  }
}

const toDomainSpanDetail = (row: SpanDetailRow): SpanDetail => ({
  ...toBaseFields(row),
  inputMessages: parseMessages(row.input_messages),
  outputMessages: parseMessages(row.output_messages),
  systemInstructions: row.system_instructions,
  toolDefinitions: row.tool_definitions,
})

const toInsertRow = (span: SpanDetail) => ({
  organization_id: span.organizationId as string,
  project_id: span.projectId as string,
  session_id: span.sessionId,
  trace_id: span.traceId as string,
  span_id: span.spanId as string,
  parent_span_id: span.parentSpanId,
  api_key_id: span.apiKeyId,
  start_time: span.startTime.toISOString(),
  end_time: span.endTime.toISOString(),
  name: span.name,
  service_name: span.serviceName,
  kind: SPAN_KIND_TO_INT[span.kind],
  status_code: STATUS_CODE_TO_INT[span.statusCode],
  status_message: span.statusMessage,
  trace_flags: span.traceFlags,
  trace_state: span.traceState,
  error_type: span.errorType,
  tags: span.tags,
  events_json: span.eventsJson,
  links_json: span.linksJson,
  operation: span.operation,
  provider: span.provider,
  model: span.model,
  response_model: span.responseModel,
  tokens_input: span.tokensInput,
  tokens_output: span.tokensOutput,
  tokens_cache_read: span.tokensCacheRead,
  tokens_cache_create: span.tokensCacheCreate,
  tokens_reasoning: span.tokensReasoning,
  cost_input_microcents: span.costInputMicrocents,
  cost_output_microcents: span.costOutputMicrocents,
  cost_total_microcents: span.costTotalMicrocents,
  cost_is_estimated: span.costIsEstimated ? 1 : 0,
  response_id: span.responseId,
  finish_reasons: span.finishReasons,
  attr_string: span.attrString,
  attr_int: span.attrInt,
  attr_float: span.attrFloat,
  attr_bool: Object.fromEntries(Object.entries(span.attrBool).map(([k, v]) => [k, v ? 1 : 0])),
  resource_string: span.resourceString,
  scope_name: span.scopeName,
  scope_version: span.scopeVersion,
  input_messages: JSON.stringify(span.inputMessages),
  output_messages: JSON.stringify(span.outputMessages),
  system_instructions: span.systemInstructions,
  tool_definitions: span.toolDefinitions,
  ingested_at: span.ingestedAt.toISOString(),
})

export const createSpanClickhouseRepository = (client: ClickHouseClient): SpanRepository => ({
  insert: (spans: readonly SpanDetail[]) =>
    insertJsonEachRow(client, "spans", spans.map(toInsertRow)).pipe(
      Effect.mapError((error) => toRepositoryError(error, "insert")),
    ),

  findByTraceId: ({ organizationId, traceId }) =>
    queryClickhouse<SpanListRow>(
      client,
      `SELECT ${LIST_COLUMNS} FROM spans FINAL
       WHERE organization_id = {organizationId:String}
         AND trace_id = {traceId:FixedString(32)}
       ORDER BY start_time ASC`,
      { organizationId: organizationId as string, traceId },
    ).pipe(
      Effect.map((rows) => rows.map(toDomainSpan)),
      Effect.mapError((error) => toRepositoryError(error, "findByTraceId")),
    ),

  findByProjectId: ({ organizationId, projectId, options }) =>
    queryClickhouse<SpanListRow>(
      client,
      `SELECT ${LIST_COLUMNS} FROM spans FINAL
       WHERE organization_id = {organizationId:String}
         AND project_id = {projectId:String}
         AND ({hasStartFrom:Bool} = false OR start_time >= {startTimeFrom:DateTime64(9, 'UTC')})
         AND ({hasStartTo:Bool} = false OR start_time <= {startTimeTo:DateTime64(9, 'UTC')})
       ORDER BY start_time DESC
       LIMIT {limit:UInt32}
       OFFSET {offset:UInt32}`,
      {
        organizationId: organizationId as string,
        projectId: projectId as string,
        hasStartFrom: options.startTimeFrom !== undefined,
        startTimeFrom: toClickhouseDateTime(options.startTimeFrom) ?? "1970-01-01 00:00:00.000000000",
        hasStartTo: options.startTimeTo !== undefined,
        startTimeTo: toClickhouseDateTime(options.startTimeTo) ?? "2100-01-01 00:00:00.000000000",
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
      },
    ).pipe(
      Effect.map((rows) => rows.map(toDomainSpan)),
      Effect.mapError((error) => toRepositoryError(error, "findByProjectId")),
    ),

  findBySpanId: ({ organizationId, traceId, spanId }) =>
    queryClickhouse<SpanDetailRow>(
      client,
      `SELECT * FROM spans FINAL
       WHERE organization_id = {organizationId:String}
         AND trace_id = {traceId:FixedString(32)}
         AND span_id = {spanId:FixedString(16)}
       LIMIT 1`,
      {
        organizationId: organizationId as string,
        traceId,
        spanId,
      },
    ).pipe(
      Effect.map((rows) => {
        const first = rows[0]
        return first ? toDomainSpanDetail(first) : null
      }),
      Effect.mapError((error) => toRepositoryError(error, "findBySpanId")),
    ),
})
