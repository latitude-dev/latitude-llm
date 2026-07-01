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
  SessionToolSpan,
  Span,
  SpanDetail,
  SpanKind,
  SpanMessagesData,
  SpanStatusCode,
  ToolDefinition,
} from "@domain/spans"
import { SpanRepository, type SpanRepositoryShape } from "@domain/spans"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { buildSpanFilterClauses } from "../registries/span-fields.ts"

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
  organization_id, project_id, session_id, user_id, user_email, trace_id, span_id,
  parent_span_id, api_key_id, simulation_id, start_time, end_time,
  name, service_name, kind, status_code, status_message,
  trace_flags, trace_state, error_type, tags, metadata,
  events_json, links_json,
  operation, provider, model, response_model,
  tool_name, tool_names,
  tokens_input, tokens_output, tokens_cache_read,
  tokens_cache_create, tokens_reasoning,
  cost_input_microcents, cost_output_microcents,
  cost_total_microcents, cost_is_estimated,
  time_to_first_token_ns, is_streaming,
  response_id, finish_reasons,
  attr_string, attr_int, attr_float, attr_bool,
  resource_string, scope_name, scope_version,
  ingested_at
`

// `LIST_COLUMNS` plus the large payload columns a `SpanDetail` needs. Selected
// explicitly (never `SELECT *`) so reads project exactly the typed row and skip
// columns the mapper ignores — keeping the per-row width, and the formatter's
// memory, bounded on paged window reads.
const DETAIL_COLUMNS = `${LIST_COLUMNS},
  input_messages, output_messages, system_instructions,
  tool_definitions, tool_call_id, tool_input, tool_output
`

// Same row shape as `DETAIL_COLUMNS`, but the heavy payload columns are returned
// as empty literals — ClickHouse never reads them from storage. For consumers
// that drop content payloads anyway (a destination with `excludePayloads`), this
// keeps a window read off the largest columns, where the formatter's memory goes.
const DETAIL_COLUMNS_NO_PAYLOADS = `${LIST_COLUMNS},
  '' AS input_messages, '' AS output_messages, '' AS system_instructions,
  '' AS tool_definitions, '' AS tool_call_id, '' AS tool_input, '' AS tool_output
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
  response_model: string
  tool_name: string
  tool_names: string[]
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create: number
  tokens_reasoning: number
  cost_input_microcents: string
  cost_output_microcents: string
  cost_total_microcents: string
  cost_is_estimated: number
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
  tool_call_id: string
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
  responseModel: row.response_model,
  toolName: normalizeCHString(row.tool_name),
  toolNames: row.tool_names.map(normalizeCHString),
  tokensInput: row.tokens_input,
  tokensOutput: row.tokens_output,
  tokensCacheRead: row.tokens_cache_read,
  tokensCacheCreate: row.tokens_cache_create,
  tokensReasoning: row.tokens_reasoning,
  costInputMicrocents: Number(row.cost_input_microcents),
  costOutputMicrocents: Number(row.cost_output_microcents),
  costTotalMicrocents: Number(row.cost_total_microcents),
  costIsEstimated: row.cost_is_estimated !== 0,
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
  span_id: string
  operation: string
  tool_call_id: string
  tool_name: string
  tool_input: string
  input_messages: string
  output_messages: string
}

const toDomainSpanMessages = (row: SpanMessagesRow): SpanMessagesData => ({
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
  toolCallId: normalizeCHString(row.tool_call_id),
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
  start_time: toClickhouseDateTime(span.startTime),
  end_time: toClickhouseDateTime(span.endTime),
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
  ingested_at: toClickhouseDateTime(span.ingestedAt),
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
              query: `SELECT ${LIST_COLUMNS}
                    FROM (
                      SELECT ${LIST_COLUMNS}
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
                ...(startTimeFrom ? { startTimeFrom: toClickhouseDateTime(startTimeFrom) } : {}),
                ...(startTimeTo ? { startTimeTo: toClickhouseDateTime(startTimeTo) } : {}),
              },
              format: "JSONEachRow",
            })
            return result.json<SpanListRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toDomainSpan)),
            Effect.mapError((error) => toRepositoryError(error, "listByTraceId")),
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
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${LIST_COLUMNS}
                    FROM (
                      SELECT ${LIST_COLUMNS}
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        ${startFromClause}
                        ${startToClause}
                        ${filterClause}
                      ORDER BY span_id, ingested_at DESC
                      LIMIT 1 BY span_id
                    )
                    ORDER BY start_time DESC
                    LIMIT {limit:UInt32}
                    OFFSET {offset:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                ...(options.startTimeFrom ? { startTimeFrom: toClickhouseDateTime(options.startTimeFrom) } : {}),
                ...(options.startTimeTo ? { startTimeTo: toClickhouseDateTime(options.startTimeTo) } : {}),
                ...filterParams,
                limit: options.limit ?? 50,
                offset: options.offset ?? 0,
              },
              format: "JSONEachRow",
            })
            return result.json<SpanListRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toDomainSpan)),
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
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Session membership mirrors the sessions_mv grouping key exactly:
              // conversation-id sessions match on session_id, orphan single-trace
              // sessions (empty session_id) match on toString(trace_id). Same
              // `LIMIT 1 BY span_id` dedupe as listByTraceId.
              query: `SELECT ${LIST_COLUMNS}
                    FROM (
                      SELECT ${LIST_COLUMNS}
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND coalesce(nullIf(session_id, ''), toString(trace_id)) = {sessionId:String}
                        ${startFromClause}
                        ${startToClause}
                      ORDER BY span_id, ingested_at DESC
                      LIMIT 1 BY span_id
                    )
                    ORDER BY start_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                sessionId: sessionId as string,
                ...(startTimeFrom ? { startTimeFrom: toClickhouseDateTime(startTimeFrom) } : {}),
                ...(startTimeTo ? { startTimeTo: toClickhouseDateTime(startTimeTo) } : {}),
              },
              format: "JSONEachRow",
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
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              // Session membership mirrors sessions_mv (see listBySessionId); only execute_tool spans.
              query: `SELECT trace_id, tool_name, tool_input, tool_output, status_code, error_type, duration_ns
                    FROM (
                      SELECT span_id, trace_id, tool_name, tool_input, tool_output, status_code, error_type, duration_ns, start_time, ingested_at
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND coalesce(nullIf(session_id, ''), toString(trace_id)) = {sessionId:String}
                        AND operation = 'execute_tool'
                      ORDER BY span_id, ingested_at DESC
                      LIMIT 1 BY span_id
                    )
                    ORDER BY start_time ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                sessionId: sessionId as string,
              },
              format: "JSONEachRow",
            })
            return result.json<SessionToolSpanRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toSessionToolSpan)),
            Effect.mapError((error) => toRepositoryError(error, "listToolSpansBySessionId")),
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
              // Late materialization: the inner `IN` subquery dedups the *whole* window
              // (`ingested_at` isn't in the sort key, so the cursor can't prune — it scans
              // every row for the org/project) but reads only `span_id`/`ingested_at`, so
              // that sort stays in the low MiB. The outer query then reads the wide payload
              // columns for just the ≤`limit` winning spans. Selecting the payloads inside
              // the dedup instead made a single window peak multi-GiB and trip the per-query
              // memory cap on payload-heavy projects (read bytes scaled with the window, not
              // the page). Keep the two levels: the `IN` set must be deduped to latest-per-
              // span before the page `LIMIT`, then the detail re-dedups the same rows.
              query: `SELECT ${columns}
                    FROM (
                      SELECT ${columns}
                      FROM spans
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND span_id IN (
                          SELECT span_id
                          FROM (
                            SELECT span_id, ingested_at
                            FROM spans
                            WHERE organization_id = {organizationId:String}
                              AND project_id = {projectId:String}
                              AND (
                                ingested_at > {cursorIngestedAt:DateTime64(3, 'UTC')}
                                OR (
                                  ingested_at = {cursorIngestedAt:DateTime64(3, 'UTC')}
                                  AND span_id > toFixedString({cursorSpanId:String}, 16)
                                )
                              )
                              AND ingested_at <= {windowEnd:DateTime64(3, 'UTC')}
                            ORDER BY span_id, ingested_at DESC
                            LIMIT 1 BY span_id
                          )
                          ORDER BY ingested_at ASC, span_id ASC
                          LIMIT {limit:UInt32}
                        )
                        AND ingested_at <= {windowEnd:DateTime64(3, 'UTC')}
                      ORDER BY span_id, ingested_at DESC
                      LIMIT 1 BY span_id
                    )
                    ORDER BY ingested_at ASC, span_id ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                cursorIngestedAt: toClickhouseDateTime(cursor.ingestedAt),
                cursorSpanId: cursor.spanId as string,
                windowEnd: toClickhouseDateTime(windowEnd),
                limit,
              },
              format: "JSONEachRow",
              // Defense-in-depth: single-threaded formatting + a per-query memory cap so a
              // pathological page fails its own job (retryable RepositoryError → BullMQ retry
              // → recorded failed run) rather than tripping the server-wide OvercommitTracker
              // and killing unrelated tenants' queries. With late materialization a window
              // peaks well under this, so it should never fire.
              clickhouse_settings: {
                output_format_parallel_formatting: 0,
                max_memory_usage: "4000000000",
              },
            })
            return result.json<SpanDetailRow>()
          })
          .pipe(
            Effect.map((rows) => {
              const spans = rows.map(toDomainSpanDetail)
              const last = spans.at(-1)
              return {
                spans,
                nextCursor: last ? { ingestedAt: last.ingestedAt, spanId: last.spanId } : null,
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

      listBySessionId,

      listToolSpansBySessionId,

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
                        ORDER BY span_id, ingested_at DESC
                        LIMIT 1 BY span_id
                      )
                      ORDER BY ingested_at DESC, span_id DESC
                      LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  limit,
                },
                format: "JSONEachRow",
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
                query: `SELECT ingested_at
                      FROM (
                        SELECT span_id, ingested_at
                        FROM spans
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND ingested_at <= {windowEnd:DateTime64(3, 'UTC')}
                        ORDER BY span_id, ingested_at DESC
                        LIMIT 1 BY span_id
                      )
                      ORDER BY ingested_at DESC, span_id DESC
                      LIMIT 1 OFFSET {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  windowEnd: toClickhouseDateTime(windowEnd),
                  limit,
                },
                format: "JSONEachRow",
              })
              return result.json<{ ingested_at: string }>()
            })
            .pipe(
              Effect.map((rows) => {
                const floor = rows.at(0)
                return floor ? parseCHDate(floor.ingested_at) : null
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
                  ...(startTimeFrom ? { startTimeFrom: toClickhouseDateTime(startTimeFrom) } : {}),
                  ...(startTimeTo ? { startTimeTo: toClickhouseDateTime(startTimeTo) } : {}),
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
                query: `SELECT span_id, operation, tool_call_id, tool_name, tool_input, input_messages, output_messages
                      FROM (
                        SELECT span_id, operation, tool_call_id, tool_name, tool_input, input_messages, output_messages, start_time
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
                  startTimeFrom: toClickhouseDateTime(startTimeFrom),
                  startTimeTo: toClickhouseDateTime(startTimeTo),
                  traceId,
                },
                format: "JSONEachRow",
              })
              return result.json<SpanMessagesRow>()
            })
            .pipe(
              Effect.map((rows) => rows.map(toDomainSpanMessages)),
              Effect.mapError((error) => toRepositoryError(error, "findMessagesForTrace")),
            )
        }),

      findMessagesForSession: ({ organizationId, projectId, sessionId, startTimeFrom, startTimeTo }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT span_id, operation, tool_call_id, tool_name, tool_input, input_messages, output_messages
                      FROM (
                        SELECT span_id, operation, tool_call_id, tool_name, tool_input, input_messages, output_messages, start_time
                        FROM spans
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND start_time >= {startTimeFrom:DateTime64(9, 'UTC')}
                          AND start_time <= {startTimeTo:DateTime64(9, 'UTC')}
                          AND coalesce(nullIf(session_id, ''), toString(trace_id)) = {sessionId:String}
                          AND operation IN ('chat', 'text_completion', 'generate_content', 'execute_tool')
                        ORDER BY span_id, ingested_at DESC
                        LIMIT 1 BY span_id
                      )
                      ORDER BY start_time ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  startTimeFrom: toClickhouseDateTime(startTimeFrom),
                  startTimeTo: toClickhouseDateTime(startTimeTo),
                  sessionId: sessionId as string,
                },
                format: "JSONEachRow",
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
                        ORDER BY span_id, ingested_at DESC
                        LIMIT 1 BY span_id
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
