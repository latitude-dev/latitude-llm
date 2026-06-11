import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SpanStatusCode, ToolDefinition } from "../entities/span.ts"

/**
 * Repository port for tool analytics (ClickHouse spans table).
 *
 * Unifies the two sides of tool telemetry:
 * - DEFINED tools: names offered to the LLM on chat spans (`tool_names`,
 *   materialized from the `tool_definitions` JSON blob).
 * - CALLED tools: `operation = 'execute_tool'` spans (`tool_name`, status,
 *   duration, input/output payloads).
 *
 * A tool can exist on either side alone: defined-but-never-called tools have
 * `metrics: null`, called-but-never-defined tools have `offeredCount: 0`.
 */
export interface ToolAnalyticsRepositoryShape {
  /**
   * Every tool in the project within the time range — the union of defined
   * and called tool names — with per-tool usage metrics, offered counts and
   * a per-tool call trend, plus project-wide totals for ratio denominators.
   */
  listToolsWithMetrics(
    input: ToolAnalyticsScope & { readonly trendBucketSeconds: number },
  ): Effect.Effect<ToolsAnalytics, RepositoryError, ChSqlClient>

  /**
   * Latest definition seen for one tool in the range (argMax over chat spans).
   * `definitionJson` is the raw JSON object text from the span payload — it
   * preserves the definition verbatim (including `"parameters": {}`).
   * Returns null when the tool was never offered in the range.
   */
  getToolDefinition(
    input: ToolAnalyticsScope & { readonly toolName: string },
  ): Effect.Effect<ToolDefinitionDetail | null, RepositoryError, ChSqlClient>

  /**
   * Usage metrics for one tool. Returns null when the tool has no calls in
   * the range. `errorsOnly` scopes every aggregate to failed calls (the
   * detail page's failure-analysis mode).
   */
  getToolUsageSummary(
    input: ToolAnalyticsScope & { readonly toolName: string; readonly errorsOnly?: boolean },
  ): Effect.Effect<ToolUsageMetrics | null, RepositoryError, ChSqlClient>

  /**
   * Per-bucket call counts over `start_time`. Omit `toolName` to aggregate
   * across every tool in the project (the list-page overview chart).
   */
  getToolCallHistogram(
    input: ToolAnalyticsScope & {
      readonly toolName?: string
      readonly bucketSeconds: number
      readonly errorsOnly?: boolean
    },
  ): Effect.Effect<readonly ToolCallHistogramBucket[], RepositoryError, ChSqlClient>

  /**
   * Most common top-level `tool_input` keys and their most common values,
   * computed over a sample of the most recent calls in the range
   * (`sampleSize` in the result).
   */
  getToolParameterStats(
    input: ToolAnalyticsScope & {
      readonly toolName: string
      readonly topKeys?: number
      readonly topValuesPerKey?: number
      readonly errorsOnly?: boolean
    },
  ): Effect.Effect<ToolParameterStatsResult, RepositoryError, ChSqlClient>

  /**
   * Where the tool is used: `model` / `provider` attribute the tool's traces
   * via their chat spans; `tag` reads tags on the tool-call spans themselves.
   * `errorsOnly` anchors on failed calls of the tool.
   */
  getToolContextBreakdown(
    input: ToolAnalyticsScope & {
      readonly toolName: string
      readonly dimension: ToolContextDimension
      readonly errorsOnly?: boolean
    },
  ): Effect.Effect<readonly ToolContextBreakdownRow[], RepositoryError, ChSqlClient>

  /**
   * Most common error outputs of one tool's failed calls, clustered by a
   * normalized form of the output (numbers/UUIDs/hex runs collapsed) so
   * variable fragments don't split one error into many buckets. Top `limit`
   * clusters by size.
   */
  getToolErrorBreakdown(
    input: ToolAnalyticsScope & {
      readonly toolName: string
      readonly limit?: number
    },
  ): Effect.Effect<readonly ToolErrorBreakdownRow[], RepositoryError, ChSqlClient>

  /**
   * Other tools called in the same traces as this one, by shared trace count.
   * With `errorsOnly`, anchors on traces where THIS tool failed — the other
   * tools' calls are not status-filtered.
   */
  getToolCoOccurrence(
    input: ToolAnalyticsScope & {
      readonly toolName: string
      readonly limit?: number
      readonly errorsOnly?: boolean
    },
  ): Effect.Effect<readonly ToolCoOccurrenceRow[], RepositoryError, ChSqlClient>

  /**
   * Most recent calls of one tool, newest first, with payloads truncated to a
   * bounded preview (full payloads live in the span detail view).
   */
  listRecentToolCalls(
    input: ToolAnalyticsScope & {
      readonly toolName: string
      readonly limit?: number
      readonly errorsOnly?: boolean
      readonly cursor?: ToolCallCursor
    },
  ): Effect.Effect<RecentToolCallPage, RepositoryError, ChSqlClient>
}

export interface ToolAnalyticsScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
}

export type ToolContextDimension = "model" | "provider" | "tag"

/** Aggregated call-side metrics for one tool. Rates are 0..1 fractions. */
export interface ToolUsageMetrics {
  readonly calls: number
  readonly errors: number
  readonly errorRate: number
  readonly avgDurationNs: number
  readonly p50DurationNs: number
  readonly p95DurationNs: number
  readonly p99DurationNs: number
  /** Distinct traces / sessions with at least one call of this tool. */
  readonly tracesUsed: number
  readonly sessionsUsed: number
  /** tracesUsed / total traces in range (0 when the project has no traces). */
  readonly traceUsageRate: number
  readonly sessionUsageRate: number
  readonly firstSeen: Date
  readonly lastUsed: Date
}

export interface ToolSummary {
  readonly name: string
  /** Null when the tool was defined but never called in the range. */
  readonly metrics: ToolUsageMetrics | null
  /** Chat spans that offered this tool. 0 means "Definition not found". */
  readonly offeredCount: number
  /** Distinct traces with at least one chat span offering this tool. */
  readonly offeredTraces: number
  readonly lastOffered: Date | null
  /**
   * Calls per offer (calls / offeredCount). Can exceed 1 when a single turn
   * calls the tool multiple times. Null when the tool was never offered.
   */
  readonly selectionRate: number | null
  /** Sparse per-tool call buckets over the range (`trendBucketSeconds` wide). */
  readonly trend: readonly ToolCallHistogramBucket[]
}

/** Project-wide denominators and rollups for the tools overview panel. */
export interface ToolsAnalyticsTotals {
  /** All traces / sessions in range (any span, not just tool activity). */
  readonly traces: number
  readonly sessions: number
  /** Traces / sessions with at least one tool call (union across tools). */
  readonly tracesWithToolCalls: number
  readonly sessionsWithToolCalls: number
}

export interface ToolsAnalytics {
  readonly totals: ToolsAnalyticsTotals
  readonly tools: readonly ToolSummary[]
}

export interface ToolDefinitionDetail {
  /** Parsed definition; null when the stored payload does not match the schema. */
  readonly definition: ToolDefinition | null
  /** Raw JSON object text, verbatim from the span payload. */
  readonly definitionJson: string
  readonly offeredCount: number
  readonly offeredTraces: number
  readonly lastOffered: Date
}

export interface ToolCallHistogramBucket {
  /** Bucket start instant (UTC ISO string). */
  readonly bucketStart: string
  readonly calls: number
  readonly errors: number
  readonly p50DurationNs: number
}

export interface ToolParameterValueStat {
  readonly value: string
  readonly count: number
}

export interface ToolParameterStat {
  readonly key: string
  /** Sampled calls whose input contains this key. */
  readonly occurrences: number
  readonly topValues: readonly ToolParameterValueStat[]
}

export interface ToolParameterStatsResult {
  readonly stats: readonly ToolParameterStat[]
  /** Number of recent calls the stats were computed over. */
  readonly sampleSize: number
}

export interface ToolContextBreakdownRow {
  readonly value: string
  /** Distinct traces for this value. */
  readonly traces: number
  /** Chat spans (model/provider) or tool calls (tag) behind the value. */
  readonly occurrences: number
}

export interface ToolCoOccurrenceRow {
  readonly otherTool: string
  readonly sharedTraces: number
}

export interface ToolErrorBreakdownRow {
  /** Normalized cluster key; empty when the calls carried no error output. */
  readonly key: string
  /** Verbatim sample output from the cluster (truncated). */
  readonly sample: string
  /** An `error_type` seen in the cluster, preferring non-empty. */
  readonly errorType: string
  readonly calls: number
}

export interface ToolCallCursor {
  readonly startTime: Date
  readonly spanId: string
}

export interface RecentToolCall {
  readonly spanId: string
  readonly traceId: string
  readonly sessionId: string
  readonly startTime: Date
  readonly durationNs: number
  readonly statusCode: SpanStatusCode
  readonly statusMessage: string
  readonly errorType: string
  readonly toolCallId: string
  /** Truncated previews — see the `*Truncated` flags. */
  readonly toolInput: string
  readonly toolOutput: string
  readonly toolInputTruncated: boolean
  readonly toolOutputTruncated: boolean
}

export interface RecentToolCallPage {
  readonly items: readonly RecentToolCall[]
  readonly hasMore: boolean
  readonly nextCursor?: ToolCallCursor
}

export class ToolAnalyticsRepository extends Context.Service<ToolAnalyticsRepository, ToolAnalyticsRepositoryShape>()(
  "@domain/spans/ToolAnalyticsRepository",
) {}
