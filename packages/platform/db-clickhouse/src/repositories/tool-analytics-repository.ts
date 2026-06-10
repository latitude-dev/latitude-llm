import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape } from "@domain/shared"
import type {
  RecentToolCall,
  RecentToolCallPage,
  SpanStatusCode,
  ToolAnalyticsScope,
  ToolCallHistogramBucket,
  ToolContextBreakdownRow,
  ToolCoOccurrenceRow,
  ToolDefinition,
  ToolDefinitionDetail,
  ToolParameterStat,
  ToolParameterStatsResult,
  ToolSummary,
  ToolsAnalytics,
  ToolUsageMetrics,
} from "@domain/spans"
import { ToolAnalyticsRepository, toolDefinitionSchema } from "@domain/spans"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

// ClickHouse DateTime64(9, 'UTC') rejects trailing 'Z'; strip it. (Mirrors the
// helper used in span-repository.ts.)
const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")

// Safety bound on the unified tool list. Tool names are LowCardinality by
// nature; projects with more distinct names than this are pathological.
const TOOL_LIST_LIMIT = 500

// Recent-calls sample used for parameter stats. Distributions converge fast,
// so a bounded recent sample captures the shape while bounding the cost of
// JSON-parsing every tool_input payload.
const TOOL_PARAM_SAMPLE_LIMIT = 10_000
// Parameter values are truncated before grouping to bound aggregation state.
const TOOL_PARAM_VALUE_CAP = 256
const TOOL_PARAM_DEFAULT_TOP_KEYS = 20
const TOOL_PARAM_MAX_TOP_KEYS = 50
const TOOL_PARAM_DEFAULT_TOP_VALUES = 5
const TOOL_PARAM_MAX_TOP_VALUES = 10

const TOOL_CONTEXT_BREAKDOWN_LIMIT = 50
const TOOL_CO_OCCURRENCE_DEFAULT_LIMIT = 10
const TOOL_CO_OCCURRENCE_MAX_LIMIT = 50

const RECENT_CALLS_DEFAULT_LIMIT = 10
const RECENT_CALLS_MAX_LIMIT = 50
// Input/output previews are capped; full payloads live in the span detail view.
const RECENT_CALLS_PAYLOAD_CAP = 4_096

// Every query is scoped by the spans table's primary-key prefix
// (organization_id, project_id, start_time) so range scans stay index-bound.
const SCOPE_FILTER = `organization_id = {organizationId:String}
  AND project_id = {projectId:String}
  AND start_time >= {from:DateTime64(9, 'UTC')}
  AND start_time <= {to:DateTime64(9, 'UTC')}`

// Tool-call spans only. tool_name != '' guards malformed producer spans that
// mark the operation without naming the tool.
const CALLS_FILTER = `${SCOPE_FILTER}
  AND operation = 'execute_tool'
  AND tool_name != ''`

const scopeParams = (scope: ToolAnalyticsScope) => ({
  organizationId: scope.organizationId as string,
  projectId: scope.projectId as string,
  from: toClickhouseDateTime(scope.from),
  to: toClickhouseDateTime(scope.to),
})

// SQL column per context dimension. Fixed map — never interpolate user input.
const CONTEXT_DIMENSION_COLUMN: Record<"model" | "provider", string> = {
  model: "model",
  provider: "provider",
}

const INT_TO_STATUS_CODE: Record<number, SpanStatusCode> = {
  0: "unset",
  1: "ok",
  2: "error",
}

const num = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const ratio = (numerator: number, denominator: number): number => (denominator > 0 ? numerator / denominator : 0)

const parseDefinition = (json: string): ToolDefinition | null => {
  try {
    const result = toolDefinitionSchema.safeParse(JSON.parse(json))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Row types for ClickHouse JSON responses
// ---------------------------------------------------------------------------

type ToolsTotalsRow = {
  total_traces: string
  total_sessions: string
  traces_with_tool_calls: string
  sessions_with_tool_calls: string
}

type ToolListRow = {
  name: string
  calls: string | null
  errors: string | null
  avg_duration_ns: number | null
  p50_duration_ns: number | null
  p95_duration_ns: number | null
  p99_duration_ns: number | null
  traces_used: string | null
  sessions_used: string | null
  first_seen: string | null
  last_used: string | null
  offered_count: string | null
  offered_traces: string | null
  last_offered: string | null
}

type ToolTrendRow = {
  name: string
  bucket_start: string
  calls: string
  errors: string
  p50_duration_ns: number
}

type ToolDefinitionRow = {
  definition_json: string
  offered_count: string
  offered_traces: string
  last_offered: string
}

type ToolUsageRow = {
  calls: string
  errors: string
  avg_duration_ns: number
  p50_duration_ns: number
  p95_duration_ns: number
  p99_duration_ns: number
  traces_used: string
  sessions_used: string
  first_seen: string
  last_used: string
  total_traces: string
  total_sessions: string
}

type HistogramRow = {
  bucket_start: string
  calls: string
  errors: string
  p50_duration_ns: number
}

type ParameterStatRow = {
  key: string
  value: string
  cnt: string
  key_total: string
}

type SampleSizeRow = {
  sample_size: string
}

type ContextBreakdownRow = {
  value: string
  traces: string
  occurrences: string
}

type CoOccurrenceRow = {
  other_tool: string
  shared_traces: string
}

type RecentCallRow = {
  span_id: string
  trace_id: string
  session_id: string
  start_time: string
  duration_ns: string
  status_code: number
  status_message: string
  error_type: string
  tool_call_id: string
  tool_input_preview: string
  tool_output_preview: string
  tool_input_truncated: number
  tool_output_truncated: number
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const toUsageMetrics = (
  row: {
    calls: string | null
    errors: string | null
    avg_duration_ns: number | null
    p50_duration_ns: number | null
    p95_duration_ns: number | null
    p99_duration_ns: number | null
    traces_used: string | null
    sessions_used: string | null
    first_seen: string | null
    last_used: string | null
  },
  totals: { traces: number; sessions: number },
): ToolUsageMetrics | null => {
  const calls = num(row.calls)
  if (calls === 0) return null
  const errors = num(row.errors)
  const tracesUsed = num(row.traces_used)
  const sessionsUsed = num(row.sessions_used)
  return {
    calls,
    errors,
    errorRate: ratio(errors, calls),
    avgDurationNs: num(row.avg_duration_ns),
    p50DurationNs: num(row.p50_duration_ns),
    p95DurationNs: num(row.p95_duration_ns),
    p99DurationNs: num(row.p99_duration_ns),
    tracesUsed,
    sessionsUsed,
    traceUsageRate: ratio(tracesUsed, totals.traces),
    sessionUsageRate: ratio(sessionsUsed, totals.sessions),
    firstSeen: parseCHDate(row.first_seen ?? ""),
    lastUsed: parseCHDate(row.last_used ?? ""),
  }
}

const toToolSummary = (
  row: ToolListRow,
  totals: { traces: number; sessions: number },
  trendByTool: ReadonlyMap<string, readonly ToolCallHistogramBucket[]>,
): ToolSummary => {
  const metrics = toUsageMetrics(row, totals)
  const offeredCount = num(row.offered_count)
  const name = normalizeCHString(row.name)
  return {
    name,
    metrics,
    offeredCount,
    offeredTraces: num(row.offered_traces),
    lastOffered: row.last_offered ? parseCHDate(row.last_offered) : null,
    selectionRate: offeredCount > 0 ? (metrics?.calls ?? 0) / offeredCount : null,
    trend: trendByTool.get(name) ?? [],
  }
}

const toRecentToolCall = (row: RecentCallRow): RecentToolCall => ({
  spanId: normalizeCHString(row.span_id),
  traceId: normalizeCHString(row.trace_id),
  sessionId: normalizeCHString(row.session_id),
  startTime: parseCHDate(row.start_time),
  durationNs: num(row.duration_ns),
  statusCode: INT_TO_STATUS_CODE[row.status_code] ?? ("unset" as const),
  statusMessage: row.status_message,
  errorType: normalizeCHString(row.error_type),
  toolCallId: normalizeCHString(row.tool_call_id),
  toolInput: row.tool_input_preview,
  toolOutput: row.tool_output_preview,
  toolInputTruncated: row.tool_input_truncated === 1,
  toolOutputTruncated: row.tool_output_truncated === 1,
})

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const ToolAnalyticsRepositoryLive = Layer.effect(
  ToolAnalyticsRepository,
  Effect.gen(function* () {
    return {
      // -- listToolsWithMetrics ---------------------------------------------
      listToolsWithMetrics: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const params = scopeParams(input)
              const [totalsResult, listResult, trendResult] = await Promise.all([
                client.query({
                  query: `SELECT
                        (SELECT uniqExact(trace_id) FROM spans WHERE ${SCOPE_FILTER}) AS total_traces,
                        (SELECT uniqExactIf(session_id, session_id != '') FROM spans WHERE ${SCOPE_FILTER}) AS total_sessions,
                        (SELECT uniqExact(trace_id) FROM spans WHERE ${CALLS_FILTER}) AS traces_with_tool_calls,
                        (SELECT uniqExactIf(session_id, session_id != '') FROM spans WHERE ${CALLS_FILTER}) AS sessions_with_tool_calls`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
                client.query({
                  // FULL OUTER JOIN of the call-side and defined-side
                  // aggregates on tool name. join_use_nulls makes the missing
                  // side NULL, which maps to "No calls" / "Definition not
                  // found" in the domain shape.
                  query: `SELECT
                        coalesce(u.name, d.name) AS name,
                        u.calls AS calls,
                        u.errors AS errors,
                        u.avg_duration_ns AS avg_duration_ns,
                        u.p50_duration_ns AS p50_duration_ns,
                        u.p95_duration_ns AS p95_duration_ns,
                        u.p99_duration_ns AS p99_duration_ns,
                        u.traces_used AS traces_used,
                        u.sessions_used AS sessions_used,
                        u.first_seen AS first_seen,
                        u.last_used AS last_used,
                        d.offered_count AS offered_count,
                        d.offered_traces AS offered_traces,
                        d.last_offered AS last_offered
                      FROM (
                        SELECT
                          tool_name AS name,
                          count() AS calls,
                          countIf(status_code = 2) AS errors,
                          avg(duration_ns) AS avg_duration_ns,
                          quantileTDigest(0.5)(duration_ns) AS p50_duration_ns,
                          quantileTDigest(0.95)(duration_ns) AS p95_duration_ns,
                          quantileTDigest(0.99)(duration_ns) AS p99_duration_ns,
                          uniqExact(trace_id) AS traces_used,
                          uniqExactIf(session_id, session_id != '') AS sessions_used,
                          min(start_time) AS first_seen,
                          max(start_time) AS last_used
                        FROM spans
                        WHERE ${CALLS_FILTER}
                        GROUP BY tool_name
                      ) AS u
                      FULL OUTER JOIN (
                        SELECT
                          def_name AS name,
                          count() AS offered_count,
                          uniqExact(trace_id) AS offered_traces,
                          max(start_time) AS last_offered
                        FROM spans
                        ARRAY JOIN tool_names AS def_name
                        WHERE ${SCOPE_FILTER} AND def_name != ''
                        GROUP BY def_name
                      ) AS d ON u.name = d.name
                      ORDER BY ifNull(calls, 0) DESC, name ASC
                      LIMIT {toolListLimit:UInt16}
                      SETTINGS join_use_nulls = 1`,
                  query_params: { ...params, toolListLimit: TOOL_LIST_LIMIT },
                  format: "JSONEachRow",
                }),
                client.query({
                  // Per-tool trend buckets for the list's sparklines, in one pass.
                  query: `SELECT
                        tool_name AS name,
                        toDateTime(
                          intDiv(toUnixTimestamp(start_time), {trendBucketSeconds:UInt32}) * {trendBucketSeconds:UInt32},
                          'UTC'
                        ) AS bucket_start,
                        count() AS calls,
                        countIf(status_code = 2) AS errors,
                        quantileTDigest(0.5)(duration_ns) AS p50_duration_ns
                      FROM spans
                      WHERE ${CALLS_FILTER}
                      GROUP BY name, bucket_start
                      ORDER BY name ASC, bucket_start ASC`,
                  query_params: { ...params, trendBucketSeconds: input.trendBucketSeconds },
                  format: "JSONEachRow",
                }),
              ])
              const totalsRows = await totalsResult.json<ToolsTotalsRow>()
              const listRows = await listResult.json<ToolListRow>()
              const trendRows = await trendResult.json<ToolTrendRow>()
              return { totalsRows, listRows, trendRows }
            })
            .pipe(
              Effect.map(({ totalsRows, listRows, trendRows }): ToolsAnalytics => {
                const totalsRow = totalsRows[0]
                const totals = {
                  traces: num(totalsRow?.total_traces),
                  sessions: num(totalsRow?.total_sessions),
                  tracesWithToolCalls: num(totalsRow?.traces_with_tool_calls),
                  sessionsWithToolCalls: num(totalsRow?.sessions_with_tool_calls),
                }
                const trendByTool = new Map<string, ToolCallHistogramBucket[]>()
                for (const row of trendRows) {
                  const name = normalizeCHString(row.name)
                  const buckets = trendByTool.get(name) ?? []
                  buckets.push({
                    bucketStart: parseCHDate(row.bucket_start).toISOString(),
                    calls: num(row.calls),
                    errors: num(row.errors),
                    p50DurationNs: num(row.p50_duration_ns),
                  })
                  trendByTool.set(name, buckets)
                }
                return {
                  totals,
                  tools: listRows.map((row) => toToolSummary(row, totals, trendByTool)),
                }
              }),
            )
        }),

      // -- getToolDefinition --------------------------------------------------
      getToolDefinition: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                // arrayFirst over the raw JSON array text keeps the definition
                // lossless (preserves "parameters": {} and key order), unlike
                // re-serializing through ClickHouse's JSON type.
                query: `SELECT
                      argMax(
                        arrayFirst(x -> JSONExtractString(x, 'name') = {toolName:String},
                                   JSONExtractArrayRaw(tool_definitions)),
                        start_time
                      ) AS definition_json,
                      count() AS offered_count,
                      uniqExact(trace_id) AS offered_traces,
                      max(start_time) AS last_offered
                    FROM spans
                    WHERE ${SCOPE_FILTER} AND has(tool_names, {toolName:String})`,
                query_params: { ...scopeParams(input), toolName: input.toolName },
                format: "JSONEachRow",
              })
              return result.json<ToolDefinitionRow>()
            })
            .pipe(
              Effect.map((rows): ToolDefinitionDetail | null => {
                const row = rows[0]
                if (!row || num(row.offered_count) === 0) return null
                return {
                  definition: parseDefinition(row.definition_json),
                  definitionJson: row.definition_json,
                  offeredCount: num(row.offered_count),
                  offeredTraces: num(row.offered_traces),
                  lastOffered: parseCHDate(row.last_offered),
                }
              }),
            )
        }),

      // -- getToolUsageSummary ------------------------------------------------
      getToolUsageSummary: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                      count() AS calls,
                      countIf(status_code = 2) AS errors,
                      avg(duration_ns) AS avg_duration_ns,
                      quantileTDigest(0.5)(duration_ns) AS p50_duration_ns,
                      quantileTDigest(0.95)(duration_ns) AS p95_duration_ns,
                      quantileTDigest(0.99)(duration_ns) AS p99_duration_ns,
                      uniqExact(trace_id) AS traces_used,
                      uniqExactIf(session_id, session_id != '') AS sessions_used,
                      min(start_time) AS first_seen,
                      max(start_time) AS last_used,
                      (SELECT uniqExact(trace_id) FROM spans WHERE ${SCOPE_FILTER}) AS total_traces,
                      (SELECT uniqExactIf(session_id, session_id != '') FROM spans WHERE ${SCOPE_FILTER}) AS total_sessions
                    FROM spans
                    WHERE ${CALLS_FILTER} AND tool_name = {toolName:String}`,
                query_params: { ...scopeParams(input), toolName: input.toolName },
                format: "JSONEachRow",
              })
              return result.json<ToolUsageRow>()
            })
            .pipe(
              Effect.map((rows): ToolUsageMetrics | null => {
                const row = rows[0]
                if (!row) return null
                return toUsageMetrics(row, {
                  traces: num(row.total_traces),
                  sessions: num(row.total_sessions),
                })
              }),
            )
        }),

      // -- getToolCallHistogram -----------------------------------------------
      getToolCallHistogram: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const toolClause = input.toolName === undefined ? "" : " AND tool_name = {toolName:String}"
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                      toDateTime(
                        intDiv(toUnixTimestamp(start_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                        'UTC'
                      ) AS bucket_start,
                      count() AS calls,
                      countIf(status_code = 2) AS errors,
                      quantileTDigest(0.5)(duration_ns) AS p50_duration_ns
                    FROM spans
                    WHERE ${CALLS_FILTER}${toolClause}
                    GROUP BY bucket_start
                    ORDER BY bucket_start ASC`,
                query_params: {
                  ...scopeParams(input),
                  bucketSeconds: input.bucketSeconds,
                  ...(input.toolName === undefined ? {} : { toolName: input.toolName }),
                },
                format: "JSONEachRow",
              })
              return result.json<HistogramRow>()
            })
            .pipe(
              Effect.map((rows): readonly ToolCallHistogramBucket[] =>
                rows.map((row) => ({
                  bucketStart: parseCHDate(row.bucket_start).toISOString(),
                  calls: num(row.calls),
                  errors: num(row.errors),
                  p50DurationNs: num(row.p50_duration_ns),
                })),
              ),
            )
        }),

      // -- getToolParameterStats ----------------------------------------------
      getToolParameterStats: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const topKeys = Math.min(Math.max(input.topKeys ?? TOOL_PARAM_DEFAULT_TOP_KEYS, 1), TOOL_PARAM_MAX_TOP_KEYS)
          const topValues = Math.min(
            Math.max(input.topValuesPerKey ?? TOOL_PARAM_DEFAULT_TOP_VALUES, 1),
            TOOL_PARAM_MAX_TOP_VALUES,
          )
          const sampleSql = `SELECT tool_input
                    FROM spans
                    WHERE ${CALLS_FILTER}
                      AND tool_name = {toolName:String}
                      AND tool_input != ''
                    ORDER BY start_time DESC
                    LIMIT {sampleLimit:UInt32}`
          return yield* chSqlClient
            .query(async (client) => {
              const params = {
                ...scopeParams(input),
                toolName: input.toolName,
                sampleLimit: TOOL_PARAM_SAMPLE_LIMIT,
              }
              const [statsResult, sampleResult] = await Promise.all([
                client.query({
                  // The window sum computes each key's total occurrences
                  // before LIMIT BY trims to the top values per key.
                  query: `SELECT key, value, cnt, key_total
                      FROM (
                        SELECT
                          kv.1 AS key,
                          substring(kv.2, 1, {valueCap:UInt16}) AS value,
                          count() AS cnt,
                          sum(count()) OVER (PARTITION BY key) AS key_total
                        FROM (${sampleSql})
                        ARRAY JOIN JSONExtractKeysAndValuesRaw(tool_input) AS kv
                        GROUP BY key, value
                      )
                      ORDER BY key_total DESC, cnt DESC, value ASC
                      LIMIT {topValues:UInt8} BY key
                      LIMIT {rowCap:UInt16}`,
                  query_params: {
                    ...params,
                    valueCap: TOOL_PARAM_VALUE_CAP,
                    topValues,
                    rowCap: topKeys * topValues,
                  },
                  format: "JSONEachRow",
                }),
                client.query({
                  query: `SELECT count() AS sample_size FROM (${sampleSql})`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
              ])
              const statRows = await statsResult.json<ParameterStatRow>()
              const sampleRows = await sampleResult.json<SampleSizeRow>()
              return { statRows, sampleRows }
            })
            .pipe(
              Effect.map(({ statRows, sampleRows }): ToolParameterStatsResult => {
                const statsByKey = new Map<
                  string,
                  { occurrences: number; topValues: { value: string; count: number }[] }
                >()
                for (const row of statRows) {
                  let entry = statsByKey.get(row.key)
                  if (!entry) {
                    if (statsByKey.size >= topKeys) continue
                    entry = { occurrences: num(row.key_total), topValues: [] }
                    statsByKey.set(row.key, entry)
                  }
                  entry.topValues.push({ value: row.value, count: num(row.cnt) })
                }
                const stats: ToolParameterStat[] = [...statsByKey.entries()].map(([key, entry]) => ({
                  key,
                  occurrences: entry.occurrences,
                  topValues: entry.topValues,
                }))
                return { stats, sampleSize: num(sampleRows[0]?.sample_size) }
              }),
            )
        }),

      // -- getToolContextBreakdown --------------------------------------------
      getToolContextBreakdown: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          // `tag` reads tags on the tool-call spans themselves; model/provider
          // attribute the tool's traces via their LLM spans (tool-call spans
          // usually carry no model).
          const query =
            input.dimension === "tag"
              ? `SELECT
                    arrayJoin(tags) AS value,
                    uniqExact(trace_id) AS traces,
                    count() AS occurrences
                  FROM spans
                  WHERE ${CALLS_FILTER} AND tool_name = {toolName:String}
                  GROUP BY value
                  ORDER BY traces DESC, value ASC
                  LIMIT {breakdownLimit:UInt16}`
              : `SELECT
                    ${CONTEXT_DIMENSION_COLUMN[input.dimension]} AS value,
                    uniqExact(trace_id) AS traces,
                    count() AS occurrences
                  FROM spans
                  WHERE ${SCOPE_FILTER}
                    AND ${CONTEXT_DIMENSION_COLUMN[input.dimension]} != ''
                    AND trace_id IN (
                      SELECT DISTINCT trace_id
                      FROM spans
                      WHERE ${CALLS_FILTER} AND tool_name = {toolName:String}
                    )
                  GROUP BY value
                  ORDER BY traces DESC, value ASC
                  LIMIT {breakdownLimit:UInt16}`
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query,
                query_params: {
                  ...scopeParams(input),
                  toolName: input.toolName,
                  breakdownLimit: TOOL_CONTEXT_BREAKDOWN_LIMIT,
                },
                format: "JSONEachRow",
              })
              return result.json<ContextBreakdownRow>()
            })
            .pipe(
              Effect.map((rows): readonly ToolContextBreakdownRow[] =>
                rows.map((row) => ({
                  value: normalizeCHString(row.value),
                  traces: num(row.traces),
                  occurrences: num(row.occurrences),
                })),
              ),
            )
        }),

      // -- getToolCoOccurrence --------------------------------------------------
      getToolCoOccurrence: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const limit = Math.min(
            Math.max(input.limit ?? TOOL_CO_OCCURRENCE_DEFAULT_LIMIT, 1),
            TOOL_CO_OCCURRENCE_MAX_LIMIT,
          )
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                      tool_name AS other_tool,
                      uniqExact(trace_id) AS shared_traces
                    FROM spans
                    WHERE ${CALLS_FILTER}
                      AND tool_name != {toolName:String}
                      AND trace_id IN (
                        SELECT DISTINCT trace_id
                        FROM spans
                        WHERE ${CALLS_FILTER} AND tool_name = {toolName:String}
                      )
                    GROUP BY other_tool
                    ORDER BY shared_traces DESC, other_tool ASC
                    LIMIT {coOccurrenceLimit:UInt16}`,
                query_params: {
                  ...scopeParams(input),
                  toolName: input.toolName,
                  coOccurrenceLimit: limit,
                },
                format: "JSONEachRow",
              })
              return result.json<CoOccurrenceRow>()
            })
            .pipe(
              Effect.map((rows): readonly ToolCoOccurrenceRow[] =>
                rows.map((row) => ({
                  otherTool: normalizeCHString(row.other_tool),
                  sharedTraces: num(row.shared_traces),
                })),
              ),
            )
        }),

      // -- listRecentToolCalls ----------------------------------------------
      listRecentToolCalls: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const limit = Math.min(Math.max(input.limit ?? RECENT_CALLS_DEFAULT_LIMIT, 1), RECENT_CALLS_MAX_LIMIT)
          const errorsClause = input.errorsOnly ? " AND status_code = 2" : ""
          const cursorClause = input.cursor
            ? " AND (start_time, span_id) < ({cursorStartTime:DateTime64(9, 'UTC')}, {cursorSpanId:FixedString(16)})"
            : ""
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                // Dedupe ReplacingMergeTree rows with `LIMIT 1 BY span_id`
                // instead of `FINAL` — the newest ingested row wins, matching
                // the table's ReplacingMergeTree(ingested_at) semantics.
                query: `SELECT *
                    FROM (
                      SELECT
                        span_id, trace_id, session_id, start_time, duration_ns,
                        status_code, status_message, error_type, tool_call_id,
                        substring(tool_input, 1, {payloadCap:UInt32}) AS tool_input_preview,
                        substring(tool_output, 1, {payloadCap:UInt32}) AS tool_output_preview,
                        length(tool_input) > {payloadCap:UInt32} AS tool_input_truncated,
                        length(tool_output) > {payloadCap:UInt32} AS tool_output_truncated
                      FROM spans
                      WHERE ${CALLS_FILTER}
                        AND tool_name = {toolName:String}${errorsClause}${cursorClause}
                      ORDER BY span_id, ingested_at DESC
                      LIMIT 1 BY span_id
                    )
                    ORDER BY start_time DESC, span_id DESC
                    LIMIT {limitPlusOne:UInt16}`,
                query_params: {
                  ...scopeParams(input),
                  toolName: input.toolName,
                  payloadCap: RECENT_CALLS_PAYLOAD_CAP,
                  limitPlusOne: limit + 1,
                  ...(input.cursor
                    ? {
                        cursorStartTime: toClickhouseDateTime(input.cursor.startTime),
                        cursorSpanId: input.cursor.spanId,
                      }
                    : {}),
                },
                format: "JSONEachRow",
              })
              return result.json<RecentCallRow>()
            })
            .pipe(
              Effect.map((rows): RecentToolCallPage => {
                const items = rows.slice(0, limit).map(toRecentToolCall)
                const hasMore = rows.length > limit
                const last = items[items.length - 1]
                return {
                  items,
                  hasMore,
                  ...(hasMore && last ? { nextCursor: { startTime: last.startTime, spanId: last.spanId } } : {}),
                }
              }),
            )
        }),
    }
  }),
)
