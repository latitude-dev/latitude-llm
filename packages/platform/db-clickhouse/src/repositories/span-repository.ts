import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
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
import type {
  MemoryOperationSpan,
  Operation,
  SessionToolSpan,
  Span,
  SpanDetail,
  SpanKind,
  SpanListCursor,
  SpanListOrderField,
  SpanMessagesData,
  SpanStatusCode,
  ToolDefinition,
  TraceConversationChunk,
} from "@domain/spans"
import { MEMORY_OPERATIONS, parseCostSource, SpanRepository, type SpanRepositoryShape } from "@domain/spans"
import { formatCHDate, normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { sessionMembershipClause } from "../registries/helpers.ts"
import { buildSpanFilterClauses } from "../registries/span-fields.ts"

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

// Columns selected for list/trace queries, minus the dynamic attribute maps
// (excludes large blob payloads).
const LIST_COLUMNS_LEAN = `
  organization_id, project_id, session_id, user_id, user_email, trace_id, span_id,
  parent_span_id, api_key_id, simulation_id, start_time, end_time,
  name, service_name, kind, status_code, status_message,
  trace_flags, trace_state, error_type, tags, metadata,
  events_json, links_json,
  operation, provider, model, agent_name, response_model,
  tool_name, tool_names, tool_call_id,
  tokens_input, tokens_output, tokens_cache_read,
  tokens_cache_create, tokens_reasoning,
  cost_input_microcents, cost_output_microcents,
  cost_total_microcents, cost_is_estimated, cost_source,
  cost_priced_provider, cost_priced_model,
  time_to_first_token_ns, is_streaming,
  response_id, finish_reasons,
  scope_name, scope_version,
  ingested_at
`

// Dynamic attribute maps are unbounded user data — instrumentors like the
// Vercel AI SDK put the full conversation into `ai.prompt*` attributes, so
// `attr_string` alone can reach GiBs per session. Only reads whose consumers
// render attributes may select these.
const ATTR_MAP_COLUMNS = `
  attr_string, attr_int, attr_float, attr_bool, resource_string
`

// Same row shape with the maps as empty literals — ClickHouse never reads
// them from storage.
const EMPTY_ATTR_MAP_COLUMNS = `
  CAST(map(), 'Map(String, String)') AS attr_string,
  CAST(map(), 'Map(String, Int64)') AS attr_int,
  CAST(map(), 'Map(String, Float64)') AS attr_float,
  CAST(map(), 'Map(String, UInt8)') AS attr_bool,
  CAST(map(), 'Map(String, String)') AS resource_string
`

// Columns selected for list/trace queries (excludes large blob payloads).
const LIST_COLUMNS = `${LIST_COLUMNS_LEAN}, ${ATTR_MAP_COLUMNS}`
const LIST_COLUMNS_NO_ATTRS = `${LIST_COLUMNS_LEAN}, ${EMPTY_ATTR_MAP_COLUMNS}`

// `LIST_COLUMNS` plus the large payload columns a `SpanDetail` needs. Selected
// explicitly (never `SELECT *`) so reads project exactly the typed row and skip
// columns the mapper ignores — keeping the per-row width, and the formatter's
// memory, bounded on paged window reads.
const DETAIL_COLUMNS = `${LIST_COLUMNS},
  input_messages, output_messages, system_instructions,
  tool_definitions, tool_input, tool_output
`

// Same row shape as `DETAIL_COLUMNS`, but the heavy payload columns are returned
// as empty literals — ClickHouse never reads them from storage. For consumers
// that drop content payloads anyway (a destination with `excludePayloads`), this
// keeps a window read off the largest columns, where the formatter's memory goes.
const DETAIL_COLUMNS_NO_PAYLOADS = `${LIST_COLUMNS},
  '' AS input_messages, '' AS output_messages, '' AS system_instructions,
  '' AS tool_definitions, '' AS tool_input, '' AS tool_output
`

type SpanListRow = {
  organization_id: string
  project_id: string
  session_id: string
  user_id: string
  user_email: string
  trace_id: string
  span_id: string
  parent_span_id: string
  api_key_id: string
  simulation_id: string
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
  metadata: Record<string, string>
  events_json: string
  links_json: string
  operation: string
  provider: string
  model: string
  agent_name: string
  response_model: string
  tool_name: string
  tool_names: string[]
  tool_call_id: string
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create: number
  tokens_reasoning: number
  cost_input_microcents: string
  cost_output_microcents: string
  cost_total_microcents: string
  duration_ns: string
  cost_is_estimated: number
  cost_source: string
  cost_priced_provider: string
  cost_priced_model: string
  time_to_first_token_ns: string
  is_streaming: number
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
  tool_input: string
  tool_output: string
}

interface SessionToolSpanRow {
  trace_id: string
  tool_name: string
  tool_input: string
  tool_output: string
  status_code: number
  error_type: string
  duration_ns: string
}

const toSessionToolSpan = (row: SessionToolSpanRow): SessionToolSpan => ({
  traceId: toTraceId(normalizeCHString(row.trace_id)),
  name: normalizeCHString(row.tool_name),
  input: row.tool_input,
  output: row.tool_output,
  error: (INT_TO_STATUS_CODE[row.status_code] ?? "unset") === "error" || normalizeCHString(row.error_type) !== "",
  durationNs: Number(row.duration_ns),
})

const toBaseFields = (row: SpanListRow) => ({
  organizationId: toOrganizationId(normalizeCHString(row.organization_id)),
  projectId: toProjectId(normalizeCHString(row.project_id)),
  sessionId: SessionId(normalizeCHString(row.session_id)),
  userId: ExternalUserId(normalizeCHString(row.user_id)),
  userEmail: normalizeCHString(row.user_email),
  traceId: toTraceId(normalizeCHString(row.trace_id)),
  spanId: SpanId(normalizeCHString(row.span_id)),
  parentSpanId: normalizeCHString(row.parent_span_id),
  apiKeyId: normalizeCHString(row.api_key_id),
  simulationId: SimulationId(normalizeCHString(row.simulation_id)),
  startTime: parseCHDate(row.start_time),
  endTime: parseCHDate(row.end_time),
  name: row.name,
  serviceName: row.service_name,
  kind: INT_TO_SPAN_KIND[row.kind] ?? ("unspecified" as const),
  statusCode: INT_TO_STATUS_CODE[row.status_code] ?? ("unset" as const),
  statusMessage: row.status_message,
  traceFlags: row.trace_flags,
  traceState: row.trace_state,
  errorType: row.error_type,
  tags: row.tags.map(normalizeCHString),
  metadata: row.metadata ?? {},
  eventsJson: row.events_json,
  linksJson: row.links_json,
  operation: row.operation,
  provider: row.provider,
  model: row.model,
  agentName: normalizeCHString(row.agent_name),
  responseModel: row.response_model,
  toolName: normalizeCHString(row.tool_name),
  toolNames: row.tool_names.map(normalizeCHString),
  toolCallId: normalizeCHString(row.tool_call_id),
  tokensInput: row.tokens_input,
  tokensOutput: row.tokens_output,
  tokensCacheRead: row.tokens_cache_read,
  tokensCacheCreate: row.tokens_cache_create,
  tokensReasoning: row.tokens_reasoning,
  costInputMicrocents: Number(row.cost_input_microcents),
  costOutputMicrocents: Number(row.cost_output_microcents),
  costTotalMicrocents: Number(row.cost_total_microcents),
  costIsEstimated: row.cost_is_estimated !== 0,
  costSource: parseCostSource(normalizeCHString(row.cost_source), {
    costTotalMicrocents: Number(row.cost_total_microcents),
    costIsEstimated: row.cost_is_estimated !== 0,
    hasTokens:
      row.tokens_input + row.tokens_output + row.tokens_cache_read + row.tokens_cache_create + row.tokens_reasoning > 0,
  }),
  costPricedProvider: normalizeCHString(row.cost_priced_provider),
  costPricedModel: normalizeCHString(row.cost_priced_model),
  timeToFirstTokenNs: Number(row.time_to_first_token_ns),
  isStreaming: row.is_streaming !== 0,
  responseId: normalizeCHString(row.response_id),
  finishReasons: row.finish_reasons.map(normalizeCHString),
  attrString: row.attr_string,
  attrInt: row.attr_int,
  attrFloat: row.attr_float,
  attrBool: Object.fromEntries(Object.entries(row.attr_bool).map(([k, v]) => [k, v !== 0])),
  resourceString: row.resource_string,
  scopeName: row.scope_name,
  scopeVersion: row.scope_version,
  ingestedAt: parseCHDate(row.ingested_at),
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

const parseSystem = (json: string): GenAISystem => {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as GenAISystem) : []
  } catch {
    return []
  }
}

const parseMessage = (json: string): GenAIMessage | null => {
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === "object" ? (parsed as GenAIMessage) : null
  } catch {
    return null
  }
}

const parseClickHouseNumber = (value: string | number | undefined): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

type SpanConversationChunkRow = {
  total_messages: string | number
  payload_bytes: string | number
  messages: readonly string[]
}

const parseToolDefinitions = (json: string): ToolDefinition[] => {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as ToolDefinition[]) : []
  } catch {
    return []
  }
}

type SpanMessagesRow = {
  trace_id: string
  span_id: string
  operation: string
  tool_call_id: string
  tool_name: string
  tool_input: string
  input_messages: string
  output_messages: string
}

const toDomainSpanMessages = (row: SpanMessagesRow): SpanMessagesData => ({
  traceId: toTraceId(normalizeCHString(row.trace_id)),
  spanId: SpanId(row.span_id),
  operation: row.operation,
  toolCallId: row.tool_call_id,
  toolName: normalizeCHString(row.tool_name),
  toolInput: row.tool_input,
  inputMessages: parseMessages(row.input_messages),
  outputMessages: parseMessages(row.output_messages),
})

const toDomainSpanDetail = (row: SpanDetailRow): SpanDetail => ({
  ...toBaseFields(row),
  inputMessages: parseMessages(row.input_messages),
  outputMessages: parseMessages(row.output_messages),
  systemInstructions: parseSystem(row.system_instructions),
  toolDefinitions: parseToolDefinitions(row.tool_definitions),
  toolInput: row.tool_input,
  toolOutput: row.tool_output,
})

const toInsertRow = (span: SpanDetail) => ({
  organization_id: span.organizationId as string,
  project_id: span.projectId as string,
  session_id: span.sessionId,
  user_id: span.userId,
  user_email: span.userEmail,
  trace_id: span.traceId as string,
  span_id: span.spanId as string,
  parent_span_id: span.parentSpanId,
  api_key_id: span.apiKeyId,
  simulation_id: span.simulationId as string,
  start_time: formatCHDate(span.startTime),
  end_time: formatCHDate(span.endTime),
  name: span.name,
  service_name: span.serviceName,
  kind: SPAN_KIND_TO_INT[span.kind],
  status_code: STATUS_CODE_TO_INT[span.statusCode],
  status_message: span.statusMessage,
  trace_flags: span.traceFlags,
  trace_state: span.traceState,
  error_type: span.errorType,
  tags: span.tags,
  metadata: span.metadata,
  events_json: span.eventsJson,
  links_json: span.linksJson,
  operation: span.operation,
  provider: span.provider,
  model: span.model,
  agent_name: span.agentName,
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
  cost_source: span.costSource,
  cost_priced_provider: span.costPricedProvider,
  cost_priced_model: span.costPricedModel,
  time_to_first_token_ns: span.timeToFirstTokenNs,
  is_streaming: span.isStreaming ? 1 : 0,
  response_id: span.responseId,
  finish_reasons: span.finishReasons,
  attr_string: span.attrString,
  attr_int: span.attrInt,
  attr_float: span.attrFloat,
  attr_bool: Object.fromEntries(Object.entries(span.attrBool).map(([k, v]) => [k, v ? 1 : 0])),
  resource_string: span.resourceString,
  scope_name: span.scopeName,
  scope_version: span.scopeVersion,
  retention_days: span.retentionDays ?? 90,
  input_messages: span.inputMessages.length > 0 ? JSON.stringify(span.inputMessages) : "",
  output_messages: span.outputMessages.length > 0 ? JSON.stringify(span.outputMessages) : "",
  system_instructions: span.systemInstructions.length > 0 ? JSON.stringify(span.systemInstructions) : "",
  tool_definitions: span.toolDefinitions.length > 0 ? JSON.stringify(span.toolDefinitions) : "",
  tool_call_id: span.toolCallId,
  tool_name: span.toolName,
  tool_input: span.toolInput,
  tool_output: span.toolOutput,
  ingested_at: formatCHDate(span.ingestedAt),
})

// See `sessionMembershipClause`, which the trace filter registry shares. Every caller spreads the
// returned params, so the prefix only has to avoid colliding with a name the query binds itself.
const sessionMembership = (sessionId: string): { clause: string; params: Record<string, string> } =>
  sessionMembershipClause(sessionId, "membership")

// Defense-in-depth for multi-span reads: single-threaded formatting, a per-query
// memory cap, and an execution-time cap so a pathological query fails its own
// request (retryable RepositoryError) rather than tripping the server-wide
// OvercommitTracker and killing unrelated tenants' queries. The time cap sits
// under the client's 30s `request_timeout` so ClickHouse cancels the query
// server-side (freeing the shared socket) instead of the client abandoning a
// query that keeps burning a thread.
const BOUNDED_READ_SETTINGS = {
  output_format_parallel_formatting: 0,
  max_memory_usage: "1000000000",
  max_execution_time: 5,
} as const

const PAGINATED_READ_SETTINGS = {
  ...BOUNDED_READ_SETTINGS,
  max_bytes_before_external_sort: "268435456",
} as const

// `listByProjectId` keyset pagination. The sort column is an enum → fixed column
// (never user-interpolated raw SQL); the cursor param is typed to match it so the
// tuple comparison is valid. Only `start_time` is in the table's primary key
// `(organization_id, project_id, start_time)`, so a `startTime` sort prunes
// granules via the index; `duration`/`cost` sorts scan the window and sort.
const SPAN_LIST_ORDER_COLUMN: Record<SpanListOrderField, string> = {
  startTime: "start_time",
  duration: "duration_ns",
  cost: "cost_total_microcents",
}
const SPAN_LIST_CURSOR_TYPE: Record<SpanListOrderField, string> = {
  startTime: "DateTime64(9, 'UTC')",
  duration: "Int64",
  cost: "UInt64",
}
// Raw sort-column value carried in the cursor at full fidelity — nanosecond
// datetime for `startTime`, the exact integer for `duration`/`cost`.
const spanListCursorSortValue = (row: SpanListRow, field: SpanListOrderField): string =>
  field === "startTime" ? row.start_time : field === "duration" ? row.duration_ns : row.cost_total_microcents

type MemoryOperationSpanRow = {
  readonly span_id: string
  readonly trace_id: string
  readonly session_id: string
  readonly user_id: string
  readonly operation: string
  readonly start_time: string
  readonly end_time: string
  readonly store_id: string
  readonly record_id: string
  readonly record_count: string | number
  readonly query_text: string
  readonly records_raw: string
}

const toMemoryOperationSpan = (row: MemoryOperationSpanRow): MemoryOperationSpan => ({
  spanId: SpanId(normalizeCHString(row.span_id)),
  traceId: toTraceId(normalizeCHString(row.trace_id)),
  sessionId: SessionId(row.session_id),
  userId: ExternalUserId(row.user_id),
  operation: row.operation as Operation,
  startTime: parseCHDate(row.start_time),
  endTime: parseCHDate(row.end_time),
  storeId: row.store_id,
  recordId: row.record_id,
  recordCount: Number(row.record_count),
  queryText: row.query_text,
  recordsRaw: row.records_raw,
})

export const SpanRepositoryLive = Layer.effect(
  SpanRepository,
  Effect.gen(function* () {
    const listByTraceId: SpanRepositoryShape["listByTraceId"] = ({
      organizationId,
      projectId,
      traceId,
      startTimeFrom,
      startTimeTo,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const startFromClause = startTimeFrom
          ? "AND start_time >= parseDateTime64BestEffort({startTimeFrom:String}, 9, 'UTC')"
          : ""
        const startToClause = startTimeTo
          ? "AND start_time <= parseDateTime64BestEffort({startTimeTo:String}, 9, 'UTC')"
          : ""
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Dedupe ReplacingMergeTree rows with `LIMIT 1 BY span_id`
              // instead of `FINAL`. `FINAL` forces a query-time merge over all
              // matching parts and is expensive for traces with many spans or
              // large payload columns. The newest ingested row wins, matching
              // the table's ReplacingMergeTree(ingested_at) semantics.
              // Drop the attr maps (same OOM hazard as listBySessionId — a trace's
              // spans can each carry whole conversations or memory records in
              // `attr_string`; the span detail view reads attributes via findBySpanId).
              query: `SELECT ${LIST_COLUMNS_LEAN}, ${EMPTY_ATTR_MAP_COLUMNS}
                    FROM (
                      SELECT ${LIST_COLUMNS_LEAN}
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id = {traceId:FixedString(32)}
                        ${startFromClause}
                        ${startToClause}
                      ORDER BY span_id, ingested_at DESC
                      LIMIT 1 BY span_id
                    )
                    ORDER BY start_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                traceId,
                ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
                ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
              },
              format: "JSONEachRow",
              clickhouse_settings: BOUNDED_READ_SETTINGS,
            })
            return result.json<SpanListRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toDomainSpan)),
            Effect.mapError((error) => toRepositoryError(error, "listByTraceId")),
          )
      })

    const listByTraceIds: SpanRepositoryShape["listByTraceIds"] = ({
      organizationId,
      projectId,
      traceIds,
      startTimeFrom,
      startTimeTo,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        if (traceIds.length === 0) return []
        const startFromClause = startTimeFrom
          ? "AND start_time >= parseDateTime64BestEffort({startTimeFrom:String}, 9, 'UTC')"
          : ""
        const startToClause = startTimeTo
          ? "AND start_time <= parseDateTime64BestEffort({startTimeTo:String}, 9, 'UTC')"
          : ""
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Dedupe by trace + span because span ids are trace-scoped, and drop
              // the attr maps (same OOM hazard as listBySessionId — the span detail
              // view reads attributes via findBySpanId).
              query: `SELECT ${LIST_COLUMNS_LEAN}, ${EMPTY_ATTR_MAP_COLUMNS}
                    FROM (
                      SELECT ${LIST_COLUMNS_LEAN}
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id IN ({traceIds:Array(String)})
                        ${startFromClause}
                        ${startToClause}
                      ORDER BY trace_id, span_id, ingested_at DESC
                      LIMIT 1 BY trace_id, span_id
                    )
                    ORDER BY start_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                traceIds: Array.from(traceIds) as string[],
                ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
                ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
              },
              format: "JSONEachRow",
              clickhouse_settings: BOUNDED_READ_SETTINGS,
            })
            return result.json<SpanListRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toDomainSpan)),
            Effect.mapError((error) => toRepositoryError(error, "listByTraceIds")),
          )
      })

    const listByProjectId: SpanRepositoryShape["listByProjectId"] = ({ organizationId, projectId, options }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const startFromClause = options.startTimeFrom
          ? "AND start_time >= parseDateTime64BestEffort({startTimeFrom:String}, 9, 'UTC')"
          : ""
        const startToClause = options.startTimeTo
          ? "AND start_time <= parseDateTime64BestEffort({startTimeTo:String}, 9, 'UTC')"
          : ""
        const { whereClauses: filterClauses, params: filterParams } = options.filters
          ? buildSpanFilterClauses(options.filters)
          : { whereClauses: [], params: {} }
        const filterClause = filterClauses.length > 0 ? `AND ${filterClauses.join(" AND ")}` : ""
        const field = options.orderBy?.field ?? "startTime"
        const direction = options.orderBy?.direction ?? "desc"
        const orderColumn = SPAN_LIST_ORDER_COLUMN[field]
        const orderDirection = direction === "asc" ? "ASC" : "DESC"
        const cursorComparator = direction === "asc" ? ">" : "<"
        const cursorClause = options.cursor
          ? `AND (${orderColumn}, trace_id, span_id) ${cursorComparator} ({cursorSort:${SPAN_LIST_CURSOR_TYPE[field]}}, {cursorTraceId:FixedString(32)}, {cursorSpanId:FixedString(16)})`
          : ""
        const limit = options.limit ?? 50
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${LIST_COLUMNS_NO_ATTRS}, duration_ns
                    FROM (
                      SELECT ${LIST_COLUMNS_LEAN}, duration_ns
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        ${startFromClause}
                        ${startToClause}
                        ${filterClause}
                        AND (trace_id, span_id, ingested_at) IN (
                          SELECT trace_id, span_id, ingested_at
                          FROM (
                            SELECT trace_id, span_id, ingested_at, start_time, duration_ns, cost_total_microcents
                            FROM spans
                            WHERE organization_id = {organizationId:String}
                              AND project_id = {projectId:String}
                              ${startFromClause}
                              ${startToClause}
                              ${filterClause}
                            ORDER BY trace_id, span_id, ingested_at DESC
                            LIMIT 1 BY trace_id, span_id
                          )
                          WHERE 1 = 1
                            ${cursorClause}
                          ORDER BY ${orderColumn} ${orderDirection}, trace_id ${orderDirection}, span_id ${orderDirection}
                          LIMIT {limitPlusOne:UInt32}
                        )
                      ORDER BY trace_id, span_id, ingested_at DESC
                      LIMIT 1 BY trace_id, span_id
                    )
                    ORDER BY ${orderColumn} ${orderDirection}, trace_id ${orderDirection}, span_id ${orderDirection}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                ...(options.startTimeFrom ? { startTimeFrom: formatCHDate(options.startTimeFrom) } : {}),
                ...(options.startTimeTo ? { startTimeTo: formatCHDate(options.startTimeTo) } : {}),
                ...filterParams,
                limitPlusOne: limit + 1,
                ...(options.cursor
                  ? {
                      cursorSort: options.cursor.sortValue,
                      cursorSpanId: options.cursor.spanId as string,
                      cursorTraceId: options.cursor.traceId as string,
                    }
                  : {}),
              },
              format: "JSONEachRow",
              clickhouse_settings: PAGINATED_READ_SETTINGS,
            })
            return result.json<SpanListRow>()
          })
          .pipe(
            Effect.map((rows) => {
              const hasMore = rows.length > limit
              const pageRows = hasMore ? rows.slice(0, limit) : rows
              const items = pageRows.map(toDomainSpan)
              const lastRow = pageRows[pageRows.length - 1]
              const lastItem = items[items.length - 1]
              const nextCursor: SpanListCursor | null =
                hasMore && lastRow && lastItem
                  ? {
                      field,
                      direction,
                      sortValue: spanListCursorSortValue(lastRow, field),
                      traceId: lastItem.traceId,
                      spanId: lastItem.spanId,
                    }
                  : null
              return { items, nextCursor }
            }),
            Effect.mapError((error) => toRepositoryError(error, "listByProjectId")),
          )
      })

    const listBySessionId: SpanRepositoryShape["listBySessionId"] = ({
      organizationId,
      projectId,
      sessionId,
      startTimeFrom,
      startTimeTo,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const startFromClause = startTimeFrom
          ? "AND start_time >= parseDateTime64BestEffort({startTimeFrom:String}, 9, 'UTC')"
          : ""
        const startToClause = startTimeTo
          ? "AND start_time <= parseDateTime64BestEffort({startTimeTo:String}, 9, 'UTC')"
          : ""
        const membership = sessionMembership(sessionId as string)
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Dedupe by trace + span because OpenTelemetry span ids are trace-scoped. The attr maps
              // come back as empty literals: a session is unbounded in span count
              // and `attr_string` alone can hold the full conversation per span
              // (Vercel AI SDK `ai.prompt*`), so reading them here has OOMed the
              // server on long agent sessions. No session-level consumer renders
              // attributes — the span detail view reads them via findBySpanId.
              query: `SELECT ${LIST_COLUMNS_LEAN}, ${EMPTY_ATTR_MAP_COLUMNS}
                    FROM (
                      SELECT ${LIST_COLUMNS_LEAN}
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND ${membership.clause}
                        ${startFromClause}
                        ${startToClause}
                      ORDER BY trace_id, span_id, ingested_at DESC
                      LIMIT 1 BY trace_id, span_id
                    )
                    ORDER BY start_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                ...membership.params,
                ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
                ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
              },
              format: "JSONEachRow",
              clickhouse_settings: BOUNDED_READ_SETTINGS,
            })
            return result.json<SpanListRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toDomainSpan)),
            Effect.mapError((error) => toRepositoryError(error, "listBySessionId")),
          )
      })

    const listToolSpansBySessionId: SpanRepositoryShape["listToolSpansBySessionId"] = ({
      organizationId,
      projectId,
      sessionId,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const membership = sessionMembership(sessionId as string)
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Session membership mirrors sessions_mv (see sessionMembership); only execute_tool spans.
              query: `SELECT trace_id, tool_name, tool_input, tool_output, status_code, error_type, duration_ns
                    FROM (
                      SELECT span_id, trace_id, tool_name, tool_input, tool_output, status_code, error_type, duration_ns, start_time, ingested_at
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND ${membership.clause}
                        AND operation = 'execute_tool'
                      ORDER BY trace_id, span_id, ingested_at DESC
                      LIMIT 1 BY trace_id, span_id
                    )
                    ORDER BY start_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                ...membership.params,
              },
              format: "JSONEachRow",
              clickhouse_settings: BOUNDED_READ_SETTINGS,
            })
            return result.json<SessionToolSpanRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toSessionToolSpan)),
            Effect.mapError((error) => toRepositoryError(error, "listToolSpansBySessionId")),
          )
      })

    const listMemoryOperationSpansByTraceId: SpanRepositoryShape["listMemoryOperationSpansByTraceId"] = ({
      organizationId,
      projectId,
      traceId,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Only memory ops (indexed `operation`), deduped by newest ingested_at. Memory
              // attributes are read as scalar map lookups so the (possibly large) records
              // payload is fetched only for these few spans, never the whole attribute map.
              query: `SELECT span_id, trace_id, session_id, user_id, operation, start_time, end_time,
                             store_id, record_id, record_count, query_text, records_raw
                      FROM (
                        SELECT span_id, trace_id, session_id, user_id, operation, start_time, end_time, ingested_at,
                               attr_string['gen_ai.memory.store.id']   AS store_id,
                               attr_string['gen_ai.memory.record.id']  AS record_id,
                               attr_int['gen_ai.memory.record.count']  AS record_count,
                               attr_string['gen_ai.memory.query.text'] AS query_text,
                               attr_string['gen_ai.memory.records']    AS records_raw
                        FROM spans
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND trace_id = {traceId:FixedString(32)}
                          AND operation IN {operations:Array(String)}
                        ORDER BY span_id, ingested_at DESC
                        LIMIT 1 BY span_id
                      )
                      ORDER BY end_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                traceId: traceId as string,
                operations: [...MEMORY_OPERATIONS],
              },
              format: "JSONEachRow",
              clickhouse_settings: BOUNDED_READ_SETTINGS,
            })
            return result.json<MemoryOperationSpanRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toMemoryOperationSpan)),
            Effect.mapError((error) => toRepositoryError(error, "listMemoryOperationSpansByTraceId")),
          )
      })

    const listByIngestedAtWindow: SpanRepositoryShape["listByIngestedAtWindow"] = ({
      organizationId,
      projectId,
      cursor,
      windowEnd,
      limit,
      excludePayloads,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const columns = excludePayloads ? DETAIL_COLUMNS_NO_PAYLOADS : DETAIL_COLUMNS
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Late materialization: dedup latest-per-trace/span before LIMIT, then re-dedup those rows after loading details.
              query: `SELECT ${columns}
                    FROM (
                      SELECT ${columns}
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND (trace_id, span_id) IN (
                          SELECT trace_id, span_id
                          FROM (
                            SELECT trace_id, span_id, ingested_at
                            FROM spans
                            WHERE organization_id = {organizationId:String}
                              AND project_id = {projectId:String}
                              AND (
                                ingested_at > {cursorIngestedAt:DateTime64(3, 'UTC')}
                                OR (
                                  ingested_at = {cursorIngestedAt:DateTime64(3, 'UTC')}
                                  AND (
                                    span_id > toFixedString({cursorSpanId:String}, 16)
                                    OR (
                                      span_id = toFixedString({cursorSpanId:String}, 16)
                                      AND trace_id > {cursorTraceId:FixedString(32)}
                                    )
                                  )
                                )
                              )
                              AND ingested_at <= {windowEnd:DateTime64(3, 'UTC')}
                            ORDER BY trace_id, span_id, ingested_at DESC
                            LIMIT 1 BY trace_id, span_id
                          )
                          ORDER BY ingested_at ASC, span_id ASC, trace_id ASC
                          LIMIT {limit:UInt32}
                        )
                        AND ingested_at <= {windowEnd:DateTime64(3, 'UTC')}
                      ORDER BY trace_id, span_id, ingested_at DESC
                      LIMIT 1 BY trace_id, span_id
                    )
                    ORDER BY ingested_at ASC, span_id ASC, trace_id ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                cursorIngestedAt: formatCHDate(cursor.ingestedAt),
                cursorSpanId: cursor.spanId as string,
                cursorTraceId: cursor.traceId as string,
                windowEnd: formatCHDate(windowEnd),
                limit,
              },
              format: "JSONEachRow",
              // With late materialization a window peaks well under the cap, so it
              // should never fire; a pathological page becomes a BullMQ retry →
              // recorded failed run.
              clickhouse_settings: BOUNDED_READ_SETTINGS,
            })
            return result.json<SpanDetailRow>()
          })
          .pipe(
            Effect.map((rows) => {
              const spans = rows.map(toDomainSpanDetail)
              const last = spans.at(-1)
              return {
                spans,
                nextCursor: last ? { ingestedAt: last.ingestedAt, spanId: last.spanId, traceId: last.traceId } : null,
              }
            }),
            Effect.mapError((error) => toRepositoryError(error, "listByIngestedAtWindow")),
          )
      })

    return {
      // TODO(repositories): rename insert -> save to keep repository write
      // verbs consistent across append-only and upsert-backed stores.
      insert: (spans: readonly SpanDetail[]) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              if (spans.length === 0) return
              await client.insert({
                table: "spans",
                values: spans.map(toInsertRow),
                format: "JSONEachRow",
                // Let CH buffer concurrent inserts into larger blocks to reduce part creation and merge pressure
                clickhouse_settings: {
                  async_insert: 1,
                  wait_for_async_insert: 1,
                },
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "insert")))
        }),

      listByTraceId,

      listByTraceIds,

      listBySessionId,

      listToolSpansBySessionId,

      listMemoryOperationSpansByTraceId,

      listByProjectId,

      listByIngestedAtWindow,

      listRecentDetailsByProjectId: ({ organizationId, projectId, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${DETAIL_COLUMNS}
                      FROM (
                        SELECT ${DETAIL_COLUMNS}
                        FROM spans
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        ORDER BY trace_id, span_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id
                      )
                      ORDER BY ingested_at DESC, span_id DESC, trace_id DESC
                      LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  limit,
                },
                format: "JSONEachRow",
                clickhouse_settings: BOUNDED_READ_SETTINGS,
              })
              return result.json<SpanDetailRow>()
            })
            .pipe(
              Effect.map((rows) => rows.map(toDomainSpanDetail)),
              Effect.mapError((error) => toRepositoryError(error, "listRecentDetailsByProjectId")),
            )
        }),

      findIngestedAtFloorForRecentLimit: ({ organizationId, projectId, windowEnd, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              // The (limit+1)-th most recent deduped span: skip the newest `limit`, take the next.
              // Empty when ≤ limit spans exist → no cap. The OFFSET runs after the dedup subquery,
              // so on a 1M+ span project this is a one-shot full dedup scan — acceptable because it
              // runs once at backfill initiation, never per window.
              const result = await client.query({
                query: `SELECT ingested_at, span_id, trace_id
                      FROM (
                        SELECT trace_id, span_id, ingested_at
                        FROM spans
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND ingested_at <= {windowEnd:DateTime64(3, 'UTC')}
                        ORDER BY trace_id, span_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id
                      )
                      ORDER BY ingested_at DESC, span_id DESC, trace_id DESC
                      LIMIT 1 OFFSET {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  windowEnd: formatCHDate(windowEnd),
                  limit,
                },
                format: "JSONEachRow",
              })
              return result.json<{ ingested_at: string; span_id: string; trace_id: string }>()
            })
            .pipe(
              Effect.map((rows) => {
                const floor = rows.at(0)
                return floor
                  ? {
                      ingestedAt: parseCHDate(floor.ingested_at),
                      spanId: SpanId(normalizeCHString(floor.span_id)),
                      traceId: toTraceId(normalizeCHString(floor.trace_id)),
                    }
                  : null
              }),
              Effect.mapError((error) => toRepositoryError(error, "findIngestedAtFloorForRecentLimit")),
            )
        }),

      findBySpanId: ({ organizationId, projectId, traceId, spanId, startTimeFrom, startTimeTo }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const startFromClause = startTimeFrom
            ? "AND start_time >= parseDateTime64BestEffort({startTimeFrom:String}, 9, 'UTC')"
            : ""
          const startToClause = startTimeTo
            ? "AND start_time <= parseDateTime64BestEffort({startTimeTo:String}, 9, 'UTC')"
            : ""
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${DETAIL_COLUMNS}
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id = {traceId:FixedString(32)}
                        AND span_id = {spanId:FixedString(16)}
                        ${startFromClause}
                        ${startToClause}
                      ORDER BY ingested_at DESC
                      LIMIT 1`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  traceId,
                  spanId,
                  ...(startTimeFrom ? { startTimeFrom: formatCHDate(startTimeFrom) } : {}),
                  ...(startTimeTo ? { startTimeTo: formatCHDate(startTimeTo) } : {}),
                },
                format: "JSONEachRow",
              })
              return result.json<SpanDetailRow>()
            })
            .pipe(
              Effect.flatMap((rows) => {
                const first = rows[0]
                if (!first) {
                  return Effect.fail(new NotFoundError({ entity: "Span", id: spanId as string }))
                }
                return Effect.succeed(toDomainSpanDetail(first))
              }),
              Effect.mapError((error) => (isNotFoundError(error) ? error : toRepositoryError(error, "findBySpanId"))),
            )
        }),

      findMessagesForTrace: ({ organizationId, projectId, traceId, startTimeFrom, startTimeTo }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                // Dedupe ReplacingMergeTree rows with `LIMIT 1 BY span_id`
                // (newest `ingested_at` wins) instead of `FINAL`, which
                // merges all matching parts at query time and is the
                // dominant memory cost for traces with heavy
                // input/output_messages payloads.
                query: `SELECT trace_id, span_id, operation, tool_call_id, tool_name, tool_input, input_messages, output_messages
                      FROM (
                        SELECT trace_id, span_id, operation, tool_call_id, tool_name, tool_input, input_messages, output_messages, start_time
                        FROM spans
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND start_time >= {startTimeFrom:DateTime64(9, 'UTC')}
                          AND start_time <= {startTimeTo:DateTime64(9, 'UTC')}
                          AND trace_id = {traceId:FixedString(32)}
                          AND operation IN ('chat', 'text_completion', 'generate_content', 'execute_tool')
                        ORDER BY span_id, ingested_at DESC
                        LIMIT 1 BY span_id
                      )
                      ORDER BY start_time ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  startTimeFrom: formatCHDate(startTimeFrom),
                  startTimeTo: formatCHDate(startTimeTo),
                  traceId,
                },
                format: "JSONEachRow",
                clickhouse_settings: BOUNDED_READ_SETTINGS,
              })
              return result.json<SpanMessagesRow>()
            })
            .pipe(
              Effect.map((rows) => rows.map(toDomainSpanMessages)),
              Effect.mapError((error) => toRepositoryError(error, "findMessagesForTrace")),
            )
        }),

      findSpanConversationChunk: ({ organizationId, projectId, traceId, spanId, offset, limit }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                // Concatenate the span's own system + input + output messages, then
                // slice. Dedup via `LIMIT 1 BY span_id` (newest ingested wins) — the
                // spans table is ReplacingMergeTree, so no GROUP BY / FINAL.
                query: `SELECT
                          length(all_messages) AS total_messages,
                          arraySum(message -> length(message), all_messages) AS payload_bytes,
                          arraySlice(all_messages, {offset:UInt64} + 1, {limit:UInt64}) AS messages
                        FROM (
                          SELECT arrayConcat(
                            if(
                              length(JSONExtractArrayRaw(system_instructions)) > 0,
                              [concat('{"role":"system","parts":', system_instructions, '}')],
                              []
                            ),
                            JSONExtractArrayRaw(input_messages),
                            JSONExtractArrayRaw(output_messages)
                          ) AS all_messages
                          FROM (
                            SELECT system_instructions, input_messages, output_messages
                            FROM spans
                            WHERE organization_id = {organizationId:String}
                              AND project_id = {projectId:String}
                              AND trace_id = {traceId:FixedString(32)}
                              AND span_id = {spanId:FixedString(16)}
                            ORDER BY span_id, ingested_at DESC
                            LIMIT 1 BY span_id
                          )
                        )`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  traceId,
                  spanId,
                  offset,
                  limit,
                },
                format: "JSONEachRow",
              })
              return result.json<SpanConversationChunkRow>()
            })
            .pipe(
              Effect.map((rows): TraceConversationChunk => {
                const row = rows[0]
                if (!row) return { messages: [], offset, limit, totalMessages: 0, hasMore: false, payloadBytes: 0 }

                const totalMessages = parseClickHouseNumber(row.total_messages)
                const messages = row.messages.flatMap((message) => {
                  const parsed = parseMessage(message)
                  return parsed ? [parsed] : []
                })

                return {
                  messages,
                  offset,
                  limit,
                  totalMessages,
                  hasMore: offset + messages.length < totalMessages,
                  payloadBytes: parseClickHouseNumber(row.payload_bytes),
                }
              }),
              Effect.mapError((error) => toRepositoryError(error, "findSpanConversationChunk")),
            )
        }),

      findMessagesForSession: ({ organizationId, projectId, sessionId, startTimeFrom, startTimeTo }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const membership = sessionMembership(sessionId as string)
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT trace_id, span_id, operation, tool_call_id, tool_name, tool_input, input_messages, output_messages
                      FROM (
                        SELECT trace_id, span_id, operation, tool_call_id, tool_name, tool_input, input_messages, output_messages, start_time
                        FROM spans
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND start_time >= {startTimeFrom:DateTime64(9, 'UTC')}
                          AND start_time <= {startTimeTo:DateTime64(9, 'UTC')}
                          AND ${membership.clause}
                          AND operation IN ('chat', 'text_completion', 'generate_content', 'execute_tool')
                        ORDER BY trace_id, span_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id
                      )
                      ORDER BY start_time ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  startTimeFrom: formatCHDate(startTimeFrom),
                  startTimeTo: formatCHDate(startTimeTo),
                  ...membership.params,
                },
                format: "JSONEachRow",
                clickhouse_settings: BOUNDED_READ_SETTINGS,
              })
              return result.json<SpanMessagesRow>()
            })
            .pipe(
              Effect.map((rows) => rows.map(toDomainSpanMessages)),
              Effect.mapError((error) => toRepositoryError(error, "findMessagesForSession")),
            )
        }),

      findLatestOutputTraceId: ({ organizationId, projectId, traceIds }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (traceIds.length === 0) return null
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT argMaxIf(trace_id, end_time, output_messages != '') AS trace_id
                      FROM (
                        SELECT trace_id, end_time, output_messages
                        FROM spans
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND trace_id IN ({traceIds:Array(String)})
                        ORDER BY trace_id, span_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id
                      )`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  traceIds: Array.from(traceIds) as string[],
                },
                format: "JSONEachRow",
              })
              return result.json<{ trace_id: string }>()
            })
            .pipe(
              Effect.map((rows) => {
                const raw = normalizeCHString(rows[0]?.trace_id ?? "")
                return raw.length > 0 ? toTraceId(raw) : null
              }),
              Effect.mapError((error) => toRepositoryError(error, "findLatestOutputTraceId")),
            )
        }),
    }
  }),
)
