import { z } from "zod"
import { monitorMetricSchema } from "./alert-incident-condition.ts"
import { filterSetSchema } from "./filter.ts"

/**
 * Breakdown dimensions per stream — logical names the API accepts, mapped to
 * ClickHouse expressions in each stream's descriptor. Every stream has its own
 * set (see the `*_BREAKDOWN_FIELDS` below), surfaced on the discriminated union
 * variants so a consumer sees exactly what each stream supports.
 */
export const TRACE_BREAKDOWN_FIELDS = [
  "model",
  "provider",
  "service",
  "tool",
  "tag",
  "name",
  "userId",
  "status",
] as const
export type TraceBreakdownField = (typeof TRACE_BREAKDOWN_FIELDS)[number]

// Sessions share the trace rollup dims except `name` (a session spans many traces,
// so there is no single root span name).
export const SESSION_BREAKDOWN_FIELDS = ["model", "provider", "service", "tool", "tag", "userId", "status"] as const
export type SessionBreakdownField = (typeof SESSION_BREAKDOWN_FIELDS)[number]

// Spans are row-grained, so model/provider/service/tool are scalar (one per span)
// and `operation` is span-specific; there is no `name` / `userId` rollup at span grain.
export const SPAN_BREAKDOWN_FIELDS = ["model", "provider", "service", "tool", "tag", "operation", "status"] as const
export type SpanBreakdownField = (typeof SPAN_BREAKDOWN_FIELDS)[number]

export const ANALYTICS_TIME_BUCKET_UNITS = ["hour", "day", "week"] as const
export const analyticsTimeBucketSchema = z.object({
  unit: z.enum(ANALYTICS_TIME_BUCKET_UNITS).describe("Bucket granularity."),
  size: z.number().int().positive().max(365).default(1).describe("Number of units per bucket (e.g. `2` weeks)."),
})
export type AnalyticsTimeBucket = z.infer<typeof analyticsTimeBucketSchema>

/** Hard ceiling on returned rows (breakdown cardinality × bucket count). */
export const ANALYTICS_MAX_LIMIT = 500
export const ANALYTICS_DEFAULT_LIMIT = 50

export const analyticsOrderBySchema = z.object({
  by: z.enum(["value", "key"]).default("value"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

const rangeSchema = z
  .object({
    fromIso: z.iso.datetime().describe("Inclusive lower bound (ISO-8601)."),
    toIso: z.iso.datetime().describe("Exclusive upper bound (ISO-8601). Must be after `fromIso`."),
  })
  .describe("The time window.")

const sharedFields = {
  filters: filterSetSchema
    .optional()
    .describe("Structured filter set applied to the stream (same DSL as `listTraces`)."),
  metric: monitorMetricSchema.describe(
    "The metric: `count`, `errorRate`, `cacheHitRate`, or `{sum|min|max|avg|median}` over `duration`/`cost`/`tokens`.",
  ),
  timeBucket: analyticsTimeBucketSchema
    .optional()
    .describe("Bucket the metric over time. Omit for a single aggregate."),
  range: rangeSchema,
  orderBy: analyticsOrderBySchema
    .default({ by: "value", direction: "desc" })
    .describe("Sort for breakdown results. Defaults to value-desc."),
  limit: z
    .number()
    .int()
    .positive()
    .max(ANALYTICS_MAX_LIMIT)
    .default(ANALYTICS_DEFAULT_LIMIT)
    .describe(`Maximum rows returned. Defaults to ${ANALYTICS_DEFAULT_LIMIT}; max ${ANALYTICS_MAX_LIMIT}.`),
} as const

const semanticQuery = z
  .string()
  .min(1)
  .max(500)
  .describe("Semantic search query, combined with `filters` via AND. Ranks/filters by relevance.")

/**
 * One composable analytics query, discriminated by `stream` so each stream
 * declares exactly what it supports: `traces` accepts a semantic `query` and a
 * `breakdown` dimension; `sessions` accepts a semantic `query`; `spans` accepts
 * neither (structural filters only). The shape is self-describing to MCP/SDK
 * consumers. Range ordering (`fromIso` < `toIso`) is enforced at the boundary.
 */
export const analyticsQuerySchema = z.discriminatedUnion("stream", [
  z
    .object({
      stream: z.literal("traces"),
      query: semanticQuery.optional(),
      breakdown: z.enum(TRACE_BREAKDOWN_FIELDS).optional().describe("Dimension to group by, one row per value."),
      ...sharedFields,
    })
    .strict(),
  z
    .object({
      stream: z.literal("sessions"),
      query: semanticQuery.optional(),
      breakdown: z.enum(SESSION_BREAKDOWN_FIELDS).optional().describe("Dimension to group by, one row per value."),
      ...sharedFields,
    })
    .strict(),
  z
    .object({
      stream: z.literal("spans"),
      breakdown: z.enum(SPAN_BREAKDOWN_FIELDS).optional().describe("Dimension to group by, one row per value."),
      ...sharedFields,
    })
    .strict(),
])

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>

/** `true` when `fromIso` is strictly before `toIso`. Enforced at the request boundary. */
export const isValidAnalyticsRange = (range: { fromIso: string; toIso: string }): boolean =>
  new Date(range.fromIso).getTime() < new Date(range.toIso).getTime()

/** One output row: a breakdown key and/or a time bucket, with the metric value. */
export interface AnalyticsSeriesPoint {
  readonly key?: string
  readonly bucketStart?: string
  readonly value: number
}
