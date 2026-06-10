import { type OrganizationId, ProjectId } from "@domain/shared"
import type {
  RecentToolCall,
  ToolAnalyticsScope,
  ToolCallHistogramBucket,
  ToolContextBreakdownRow,
  ToolCoOccurrenceRow,
  ToolDefinitionDetail,
  ToolParameterStatsResult,
  ToolSummary,
  ToolsAnalyticsTotals,
  ToolUsageMetrics,
} from "@domain/spans"
import { ToolAnalyticsRepository } from "@domain/spans"
import { ToolAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getClickhouseClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"

// ---------------------------------------------------------------------------
// Wire records (Dates serialized to ISO strings)
// ---------------------------------------------------------------------------

export interface ToolUsageMetricsRecord {
  readonly calls: number
  readonly errors: number
  readonly errorRate: number
  readonly avgDurationNs: number
  readonly p50DurationNs: number
  readonly p95DurationNs: number
  readonly p99DurationNs: number
  readonly tracesUsed: number
  readonly sessionsUsed: number
  readonly traceUsageRate: number
  readonly sessionUsageRate: number
  readonly firstSeen: string
  readonly lastUsed: string
}

export interface ToolSummaryRecord {
  readonly name: string
  readonly metrics: ToolUsageMetricsRecord | null
  readonly offeredCount: number
  readonly offeredTraces: number
  readonly lastOffered: string | null
  readonly selectionRate: number | null
  readonly trend: readonly ToolCallHistogramBucket[]
}

export interface ToolsAnalyticsRecord {
  readonly totals: ToolsAnalyticsTotals
  readonly tools: readonly ToolSummaryRecord[]
}

interface ToolDefinitionDetailRecord {
  /**
   * Parsed name/description for headers; `definitionJson` carries the full
   * lossless definition (including `parameters`) for display.
   */
  readonly definition: { readonly name: string; readonly description: string } | null
  readonly definitionJson: string
  readonly offeredCount: number
  readonly offeredTraces: number
  readonly lastOffered: string
}

interface ToolDetailRecord {
  readonly definition: ToolDefinitionDetailRecord | null
  /** Always the global (all-calls) metrics. */
  readonly usage: ToolUsageMetricsRecord | null
  /** Failed-calls-only metrics; populated only when requested via `errorsOnly`. */
  readonly errorsUsage: ToolUsageMetricsRecord | null
}

export interface RecentToolCallRecord {
  readonly spanId: string
  readonly traceId: string
  readonly sessionId: string
  readonly startTime: string
  readonly durationNs: number
  readonly statusCode: "unset" | "ok" | "error"
  readonly statusMessage: string
  readonly errorType: string
  readonly toolCallId: string
  readonly toolInput: string
  readonly toolOutput: string
  readonly toolInputTruncated: boolean
  readonly toolOutputTruncated: boolean
}

interface RecentToolCallsPageRecord {
  readonly items: readonly RecentToolCallRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: { readonly startTimeIso: string; readonly spanId: string }
}

const toUsageMetricsRecord = (metrics: ToolUsageMetrics): ToolUsageMetricsRecord => ({
  calls: metrics.calls,
  errors: metrics.errors,
  errorRate: metrics.errorRate,
  avgDurationNs: metrics.avgDurationNs,
  p50DurationNs: metrics.p50DurationNs,
  p95DurationNs: metrics.p95DurationNs,
  p99DurationNs: metrics.p99DurationNs,
  tracesUsed: metrics.tracesUsed,
  sessionsUsed: metrics.sessionsUsed,
  traceUsageRate: metrics.traceUsageRate,
  sessionUsageRate: metrics.sessionUsageRate,
  firstSeen: metrics.firstSeen.toISOString(),
  lastUsed: metrics.lastUsed.toISOString(),
})

const toToolSummaryRecord = (tool: ToolSummary): ToolSummaryRecord => ({
  name: tool.name,
  metrics: tool.metrics ? toUsageMetricsRecord(tool.metrics) : null,
  offeredCount: tool.offeredCount,
  offeredTraces: tool.offeredTraces,
  lastOffered: tool.lastOffered ? tool.lastOffered.toISOString() : null,
  selectionRate: tool.selectionRate,
  trend: tool.trend,
})

const toDefinitionDetailRecord = (detail: ToolDefinitionDetail): ToolDefinitionDetailRecord => ({
  definition: detail.definition ? { name: detail.definition.name, description: detail.definition.description } : null,
  definitionJson: detail.definitionJson,
  offeredCount: detail.offeredCount,
  offeredTraces: detail.offeredTraces,
  lastOffered: detail.lastOffered.toISOString(),
})

const toRecentToolCallRecord = (call: RecentToolCall): RecentToolCallRecord => ({
  spanId: call.spanId,
  traceId: call.traceId,
  sessionId: call.sessionId,
  startTime: call.startTime.toISOString(),
  durationNs: call.durationNs,
  statusCode: call.statusCode,
  statusMessage: call.statusMessage,
  errorType: call.errorType,
  toolCallId: call.toolCallId,
  toolInput: call.toolInput,
  toolOutput: call.toolOutput,
  toolInputTruncated: call.toolInputTruncated,
  toolOutputTruncated: call.toolOutputTruncated,
})

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const toolsScopeSchema = z.object({
  sandboxOrgId: z.string().optional(),
  projectId: z.string(),
  fromIso: z.string().datetime(),
  toIso: z.string().datetime(),
})

const toolNameSchema = z.string().min(1).max(256)

const toScope = (orgId: OrganizationId, data: z.infer<typeof toolsScopeSchema>): ToolAnalyticsScope => ({
  organizationId: orgId,
  projectId: ProjectId(data.projectId),
  from: new Date(data.fromIso),
  to: new Date(data.toIso),
})

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const listProjectTools = createServerFn({ method: "GET" })
  .inputValidator(
    toolsScopeSchema.extend({
      trendBucketSeconds: z
        .number()
        .int()
        .positive()
        .max(90 * 24 * 60 * 60),
    }),
  )
  .handler(async ({ data }): Promise<ToolsAnalyticsRecord> => {
    const orgId = await resolveOrgScope(data)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ToolAnalyticsRepository
        const analytics = yield* repo.listToolsWithMetrics({
          ...toScope(orgId, data),
          trendBucketSeconds: data.trendBucketSeconds,
        })
        return {
          totals: analytics.totals,
          tools: analytics.tools.map(toToolSummaryRecord),
        }
      }).pipe(withClickHouse(ToolAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getProjectToolDetail = createServerFn({ method: "GET" })
  .inputValidator(toolsScopeSchema.extend({ toolName: toolNameSchema, errorsOnly: z.boolean().optional() }))
  .handler(async ({ data }): Promise<ToolDetailRecord> => {
    const orgId = await resolveOrgScope(data)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ToolAnalyticsRepository
        const scope = toScope(orgId, data)
        const [definition, usage, errorsUsage] = yield* Effect.all(
          [
            repo.getToolDefinition({ ...scope, toolName: data.toolName }),
            repo.getToolUsageSummary({ ...scope, toolName: data.toolName }),
            // Failure-analysis mode also needs the failed-calls metrics; the
            // global summary stays so the page can show the real error rate.
            data.errorsOnly
              ? repo.getToolUsageSummary({ ...scope, toolName: data.toolName, errorsOnly: true })
              : Effect.succeed(null),
          ],
          { concurrency: 3 },
        )
        return {
          definition: definition ? toDefinitionDetailRecord(definition) : null,
          usage: usage ? toUsageMetricsRecord(usage) : null,
          errorsUsage: errorsUsage ? toUsageMetricsRecord(errorsUsage) : null,
        }
      }).pipe(withClickHouse(ToolAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getToolCallHistogram = createServerFn({ method: "GET" })
  .inputValidator(
    toolsScopeSchema.extend({
      toolName: toolNameSchema.optional(),
      bucketSeconds: z
        .number()
        .int()
        .positive()
        .max(90 * 24 * 60 * 60),
      errorsOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<readonly ToolCallHistogramBucket[]> => {
    const orgId = await resolveOrgScope(data)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolCallHistogram({
          ...toScope(orgId, data),
          bucketSeconds: data.bucketSeconds,
          ...(data.toolName === undefined ? {} : { toolName: data.toolName }),
          ...(data.errorsOnly === undefined ? {} : { errorsOnly: data.errorsOnly }),
        })
      }).pipe(withClickHouse(ToolAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getToolParameterStats = createServerFn({ method: "GET" })
  .inputValidator(
    toolsScopeSchema.extend({
      toolName: toolNameSchema,
      topKeys: z.number().int().min(1).max(50).optional(),
      topValuesPerKey: z.number().int().min(1).max(10).optional(),
      errorsOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<ToolParameterStatsResult> => {
    const orgId = await resolveOrgScope(data)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolParameterStats({
          ...toScope(orgId, data),
          toolName: data.toolName,
          ...(data.topKeys === undefined ? {} : { topKeys: data.topKeys }),
          ...(data.topValuesPerKey === undefined ? {} : { topValuesPerKey: data.topValuesPerKey }),
          ...(data.errorsOnly === undefined ? {} : { errorsOnly: data.errorsOnly }),
        })
      }).pipe(withClickHouse(ToolAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getToolContextBreakdown = createServerFn({ method: "GET" })
  .inputValidator(
    toolsScopeSchema.extend({
      toolName: toolNameSchema,
      dimension: z.enum(["model", "provider", "tag"]),
      errorsOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<readonly ToolContextBreakdownRow[]> => {
    const orgId = await resolveOrgScope(data)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolContextBreakdown({
          ...toScope(orgId, data),
          toolName: data.toolName,
          dimension: data.dimension,
          ...(data.errorsOnly === undefined ? {} : { errorsOnly: data.errorsOnly }),
        })
      }).pipe(withClickHouse(ToolAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getToolCoOccurrence = createServerFn({ method: "GET" })
  .inputValidator(
    toolsScopeSchema.extend({
      toolName: toolNameSchema,
      limit: z.number().int().min(1).max(50).optional(),
      errorsOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<readonly ToolCoOccurrenceRow[]> => {
    const orgId = await resolveOrgScope(data)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolCoOccurrence({
          ...toScope(orgId, data),
          toolName: data.toolName,
          ...(data.limit === undefined ? {} : { limit: data.limit }),
          ...(data.errorsOnly === undefined ? {} : { errorsOnly: data.errorsOnly }),
        })
      }).pipe(withClickHouse(ToolAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const listRecentToolCalls = createServerFn({ method: "GET" })
  .inputValidator(
    toolsScopeSchema.extend({
      toolName: toolNameSchema,
      limit: z.number().int().min(1).max(50).optional(),
      errorsOnly: z.boolean().optional(),
      cursor: z.object({ startTimeIso: z.string().datetime(), spanId: z.string().length(16) }).optional(),
    }),
  )
  .handler(async ({ data }): Promise<RecentToolCallsPageRecord> => {
    const orgId = await resolveOrgScope(data)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ToolAnalyticsRepository
        const page = yield* repo.listRecentToolCalls({
          ...toScope(orgId, data),
          toolName: data.toolName,
          ...(data.limit === undefined ? {} : { limit: data.limit }),
          ...(data.errorsOnly === undefined ? {} : { errorsOnly: data.errorsOnly }),
          ...(data.cursor
            ? { cursor: { startTime: new Date(data.cursor.startTimeIso), spanId: data.cursor.spanId } }
            : {}),
        })
        return {
          items: page.items.map(toRecentToolCallRecord),
          hasMore: page.hasMore,
          ...(page.nextCursor
            ? {
                nextCursor: {
                  startTimeIso: page.nextCursor.startTime.toISOString(),
                  spanId: page.nextCursor.spanId,
                },
              }
            : {}),
        }
      }).pipe(withClickHouse(ToolAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })
