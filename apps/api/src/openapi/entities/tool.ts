import { SPAN_ID_LENGTH } from "@domain/shared"
import type {
  RecentToolCall,
  ToolCallHistogramBucket,
  ToolContextBreakdownRow,
  ToolCoOccurrenceRow,
  ToolDefinitionDetail,
  ToolErrorBreakdownRow,
  ToolParameterStatsResult,
  ToolSummary,
  ToolsAnalytics,
  ToolUsageMetrics,
} from "@domain/spans"
import { z } from "@hono/zod-openapi"
import { Paginated } from "../pagination.ts"

/** Default analytics window when the caller omits `fromIso`/`toIso`. */
const DEFAULT_TOOLS_RANGE_SECONDS = 7 * 24 * 60 * 60

export const MIN_BUCKET_SECONDS = 60 * 60
export const MAX_BUCKET_SECONDS = 90 * 24 * 60 * 60

const TARGET_TREND_BUCKETS = 30
const DAY_SECONDS = 24 * 60 * 60

/**
 * Picks a trend/histogram bucket width that yields ~30 buckets across the
 * range, snapped to hour/day boundaries. Mirrors the web's
 * `pickToolTrendBucketSeconds` so API charts match the UI's bucketing.
 */
export const deriveBucketSeconds = (from: Date, to: Date): number => {
  const rawSeconds = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 1000 / TARGET_TREND_BUCKETS))
  if (rawSeconds <= MIN_BUCKET_SECONDS) return MIN_BUCKET_SECONDS
  if (rawSeconds <= DAY_SECONDS) return Math.ceil(rawSeconds / MIN_BUCKET_SECONDS) * MIN_BUCKET_SECONDS
  return Math.max(1, Math.round(rawSeconds / DAY_SECONDS)) * DAY_SECONDS
}

/** `to` defaults to now; `from` defaults to `DEFAULT_TOOLS_RANGE_SECONDS` before `to`. */
export const resolveRange = (fromIso?: string, toIso?: string): { from: Date; to: Date } => {
  const to = toIso ? new Date(toIso) : new Date()
  const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - DEFAULT_TOOLS_RANGE_SECONDS * 1000)
  return { from, to }
}

/**
 * Opaque cursor over the wire — base64url JSON of `{ startTimeIso, spanId }`.
 * Keeps the public surface a plain `string` while the ClickHouse repo hands
 * back its `(startTime, spanId)` tuple unchanged.
 */
export const encodeToolCallCursor = (cursor: { startTime: Date; spanId: string }): string =>
  Buffer.from(JSON.stringify({ startTimeIso: cursor.startTime.toISOString(), spanId: cursor.spanId }), "utf8").toString(
    "base64url",
  )

export const decodeToolCallCursor = (raw: string): { startTime: Date; spanId: string } | null => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown
    if (parsed === null || typeof parsed !== "object") return null
    const { startTimeIso, spanId } = parsed as { startTimeIso?: unknown; spanId?: unknown }
    if (typeof startTimeIso !== "string" || typeof spanId !== "string" || spanId.length !== SPAN_ID_LENGTH) return null
    const startTime = new Date(startTimeIso)
    if (Number.isNaN(startTime.getTime())) return null
    return { startTime, spanId }
  } catch {
    return null
  }
}

const ToolUsageMetricsSchema = z
  .object({
    calls: z.number().int().describe("Number of times the tool was called in the range."),
    errors: z.number().int().describe("Number of calls that ended in an error."),
    errorRate: z.number().describe("Fraction of calls that errored, 0..1."),
    avgDurationNs: z.number().describe("Mean call duration, in nanoseconds."),
    p50DurationNs: z.number().describe("Median (p50) call duration, in nanoseconds."),
    p95DurationNs: z.number().describe("95th-percentile call duration, in nanoseconds."),
    p99DurationNs: z.number().describe("99th-percentile call duration, in nanoseconds."),
    tracesUsed: z.number().int().describe("Distinct traces with at least one call of this tool."),
    sessionsUsed: z.number().int().describe("Distinct sessions with at least one call of this tool."),
    traceUsageRate: z.number().describe("`tracesUsed` divided by total traces in the range, 0..1."),
    sessionUsageRate: z.number().describe("`sessionsUsed` divided by total sessions in the range, 0..1."),
    firstSeen: z.string().describe("ISO-8601 timestamp of the first call in the range."),
    lastUsed: z.string().describe("ISO-8601 timestamp of the most recent call in the range."),
  })
  .openapi("ToolUsageMetrics")

const ToolCallHistogramBucketSchema = z
  .object({
    bucketStart: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
    calls: z.number().int().describe("Number of calls in this bucket."),
    errors: z.number().int().describe("Number of errored calls in this bucket."),
    p50DurationNs: z.number().describe("Median call duration in this bucket, in nanoseconds."),
  })
  .openapi("ToolCallHistogramBucket")

const ToolSummarySchema = z
  .object({
    name: z.string().describe("Tool name."),
    metrics: ToolUsageMetricsSchema.nullable().describe(
      "Call-side usage metrics. `null` when the tool was defined but never called in the range.",
    ),
    offeredCount: z.number().int().describe("LLM turns that offered this tool. 0 means no definition was seen."),
    offeredTraces: z.number().int().describe("Distinct traces that offered this tool."),
    lastOffered: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp the tool was last offered. `null` when never offered."),
    selectionRate: z
      .number()
      .nullable()
      .describe("Calls per offer (`calls / offeredCount`). Can exceed 1. `null` when never offered."),
    trend: z.array(ToolCallHistogramBucketSchema).describe("Per-bucket call counts across the range."),
  })
  .openapi("ToolSummary")

const ToolsAnalyticsTotalsSchema = z
  .object({
    traces: z.number().int().describe("Total traces in the range."),
    sessions: z.number().int().describe("Total sessions in the range."),
    tracesWithToolCalls: z.number().int().describe("Traces with at least one tool call (any tool)."),
    sessionsWithToolCalls: z.number().int().describe("Sessions with at least one tool call (any tool)."),
  })
  .openapi("ToolsAnalyticsTotals")

export const ToolsAnalyticsResponseSchema = z
  .object({
    totals: ToolsAnalyticsTotalsSchema.describe("Project-wide denominators for the range."),
    tools: z.array(ToolSummarySchema).describe("Every tool in the range — the union of defined and called tools."),
  })
  .openapi("ToolsAnalyticsResponse")

const ToolDefinitionDetailSchema = z
  .object({
    definition: z
      .object({
        name: z.string().describe("Tool name from the definition."),
        description: z.string().describe("Tool description from the definition."),
      })
      .nullable()
      .describe("Parsed name and description. `null` when the stored definition could not be parsed."),
    definitionJson: z.string().describe("Raw tool definition JSON, verbatim, including its `parameters`."),
    offeredCount: z.number().int().describe("LLM turns that offered this tool in the range."),
    offeredTraces: z.number().int().describe("Distinct traces that offered this tool."),
    lastOffered: z.string().describe("ISO-8601 timestamp the tool was last offered."),
  })
  .openapi("ToolDefinitionDetail")

export const ToolDetailResponseSchema = z
  .object({
    definition: ToolDefinitionDetailSchema.nullable().describe(
      "Latest definition seen for the tool. `null` when never offered in the range.",
    ),
    usage: ToolUsageMetricsSchema.nullable().describe(
      "Global (all-calls) usage metrics. `null` when the tool has no calls in the range.",
    ),
    errorsUsage: ToolUsageMetricsSchema.nullable().describe(
      "Failed-calls-only usage metrics. Non-null only when `errorsOnly=true` is requested.",
    ),
  })
  .openapi("ToolDetailResponse")

export const ToolHistogramResponseSchema = z
  .object({ items: z.array(ToolCallHistogramBucketSchema).describe("Call buckets across the range, oldest first.") })
  .openapi("ToolHistogramResponse")

const ToolParameterValueStatSchema = z
  .object({
    value: z.string().describe("A value seen for the key (truncated)."),
    count: z.number().int().describe("Number of sampled calls with this value."),
  })
  .openapi("ToolParameterValueStat")

const ToolParameterStatSchema = z
  .object({
    key: z.string().describe("A top-level key in the tool's input."),
    occurrences: z.number().int().describe("Sampled calls whose input contains this key."),
    topValues: z.array(ToolParameterValueStatSchema).describe("Most common values for this key."),
  })
  .openapi("ToolParameterStat")

export const ToolParameterStatsResponseSchema = z
  .object({
    stats: z.array(ToolParameterStatSchema).describe("Top input keys and their most common values."),
    sampleSize: z.number().int().describe("Number of recent calls the stats were computed over."),
  })
  .openapi("ToolParameterStatsResponse")

export const ToolContextBreakdownResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            value: z.string().describe("The dimension value (a model, provider, or tag)."),
            traces: z.number().int().describe("Distinct traces for this value."),
            occurrences: z.number().int().describe("Underlying spans or calls behind this value."),
          })
          .openapi("ToolContextBreakdownRow"),
      )
      .describe("Breakdown rows, most significant first."),
  })
  .openapi("ToolContextBreakdownResponse")

export const ToolCoOccurrenceResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            otherTool: z.string().describe("Another tool called in the same traces."),
            sharedTraces: z.number().int().describe("Traces where both tools were called."),
          })
          .openapi("ToolCoOccurrenceRow"),
      )
      .describe("Co-occurring tools, by shared trace count."),
  })
  .openapi("ToolCoOccurrenceResponse")

export const ToolErrorBreakdownResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            key: z.string().describe("Normalized error cluster key. Empty when the calls carried no error output."),
            sample: z.string().describe("A verbatim error output from the cluster (truncated)."),
            errorType: z.string().describe("An error type seen in the cluster."),
            calls: z.number().int().describe("Number of failed calls in the cluster."),
          })
          .openapi("ToolErrorBreakdownRow"),
      )
      .describe("Error clusters, most frequent first."),
  })
  .openapi("ToolErrorBreakdownResponse")

const RecentToolCallSchema = z
  .object({
    spanId: z.string().describe("16-character span identifier of the tool call."),
    traceId: z.string().describe("Trace this call belongs to."),
    sessionId: z.string().describe("Session this call belongs to."),
    startTime: z.string().describe("ISO-8601 timestamp the call started."),
    durationNs: z.number().describe("Call duration, in nanoseconds."),
    statusCode: z.enum(["unset", "ok", "error"]).describe("Span status of the call."),
    statusMessage: z.string().describe("Status message, when present."),
    errorType: z.string().describe("Error type, when the call failed."),
    toolCallId: z.string().describe("Provider tool-call id linking the call to its request."),
    toolInput: z.string().describe("Truncated preview of the call arguments."),
    toolOutput: z.string().describe("Truncated preview of the call result."),
    toolInputTruncated: z.boolean().describe("`true` when `toolInput` was truncated."),
    toolOutputTruncated: z.boolean().describe("`true` when `toolOutput` was truncated."),
  })
  .openapi("RecentToolCall")

export const PaginatedToolCallsSchema = Paginated(RecentToolCallSchema, "PaginatedToolCalls")

const toUsageMetricsResponse = (m: ToolUsageMetrics) => ({
  calls: m.calls,
  errors: m.errors,
  errorRate: m.errorRate,
  avgDurationNs: m.avgDurationNs,
  p50DurationNs: m.p50DurationNs,
  p95DurationNs: m.p95DurationNs,
  p99DurationNs: m.p99DurationNs,
  tracesUsed: m.tracesUsed,
  sessionsUsed: m.sessionsUsed,
  traceUsageRate: m.traceUsageRate,
  sessionUsageRate: m.sessionUsageRate,
  firstSeen: m.firstSeen.toISOString(),
  lastUsed: m.lastUsed.toISOString(),
})

const toHistogramBucketResponse = (b: ToolCallHistogramBucket) => ({
  bucketStart: b.bucketStart,
  calls: b.calls,
  errors: b.errors,
  p50DurationNs: b.p50DurationNs,
})

const toToolSummaryResponse = (t: ToolSummary) => ({
  name: t.name,
  metrics: t.metrics ? toUsageMetricsResponse(t.metrics) : null,
  offeredCount: t.offeredCount,
  offeredTraces: t.offeredTraces,
  lastOffered: t.lastOffered ? t.lastOffered.toISOString() : null,
  selectionRate: t.selectionRate,
  trend: t.trend.map(toHistogramBucketResponse),
})

export const toToolsAnalyticsResponse = (a: ToolsAnalytics) => ({
  totals: {
    traces: a.totals.traces,
    sessions: a.totals.sessions,
    tracesWithToolCalls: a.totals.tracesWithToolCalls,
    sessionsWithToolCalls: a.totals.sessionsWithToolCalls,
  },
  tools: a.tools.map(toToolSummaryResponse),
})

const toDefinitionDetailResponse = (d: ToolDefinitionDetail) => ({
  definition: d.definition ? { name: d.definition.name, description: d.definition.description } : null,
  definitionJson: d.definitionJson,
  offeredCount: d.offeredCount,
  offeredTraces: d.offeredTraces,
  lastOffered: d.lastOffered.toISOString(),
})

export const toToolDetailResponse = (
  definition: ToolDefinitionDetail | null,
  usage: ToolUsageMetrics | null,
  errorsUsage: ToolUsageMetrics | null,
) => ({
  definition: definition ? toDefinitionDetailResponse(definition) : null,
  usage: usage ? toUsageMetricsResponse(usage) : null,
  errorsUsage: errorsUsage ? toUsageMetricsResponse(errorsUsage) : null,
})

export const toHistogramResponse = (buckets: readonly ToolCallHistogramBucket[]) => ({
  items: buckets.map(toHistogramBucketResponse),
})

export const toParameterStatsResponse = (result: ToolParameterStatsResult) => ({
  stats: result.stats.map((s) => ({
    key: s.key,
    occurrences: s.occurrences,
    topValues: s.topValues.map((v) => ({ value: v.value, count: v.count })),
  })),
  sampleSize: result.sampleSize,
})

export const toContextBreakdownResponse = (rows: readonly ToolContextBreakdownRow[]) => ({
  items: rows.map((r) => ({ value: r.value, traces: r.traces, occurrences: r.occurrences })),
})

export const toCoOccurrenceResponse = (rows: readonly ToolCoOccurrenceRow[]) => ({
  items: rows.map((r) => ({ otherTool: r.otherTool, sharedTraces: r.sharedTraces })),
})

export const toErrorBreakdownResponse = (rows: readonly ToolErrorBreakdownRow[]) => ({
  items: rows.map((r) => ({ key: r.key, sample: r.sample, errorType: r.errorType, calls: r.calls })),
})

export const toRecentToolCallResponse = (c: RecentToolCall) => ({
  spanId: c.spanId,
  traceId: c.traceId,
  sessionId: c.sessionId,
  startTime: c.startTime.toISOString(),
  durationNs: c.durationNs,
  statusCode: c.statusCode,
  statusMessage: c.statusMessage,
  errorType: c.errorType,
  toolCallId: c.toolCallId,
  toolInput: c.toolInput,
  toolOutput: c.toolOutput,
  toolInputTruncated: c.toolInputTruncated,
  toolOutputTruncated: c.toolOutputTruncated,
})
