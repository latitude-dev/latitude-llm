import { z } from "zod"
import { type MonitorMetric, monitorMetricSchema } from "./alert-incident-condition.ts"
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

// Scores are the signal grain: `signalId` / `source` are direct columns; the trace
// dims (`model`…`tag`) resolve through each score's trace via the traces rollup.
export const SCORE_BREAKDOWN_FIELDS = ["signalId", "source", "model", "provider", "service", "tool", "tag"] as const
export type ScoreBreakdownField = (typeof SCORE_BREAKDOWN_FIELDS)[number]

// Behaviors are taxonomy observations (a behavior instance within a session).
export const BEHAVIOR_BREAKDOWN_FIELDS = ["cluster", "session", "method"] as const
export type BehaviorBreakdownField = (typeof BEHAVIOR_BREAKDOWN_FIELDS)[number]

// Moments are semantic-moment labels (one row per label within a session moment).
export const MOMENT_BREAKDOWN_FIELDS = ["kind", "actor", "session"] as const
export type MomentBreakdownField = (typeof MOMENT_BREAKDOWN_FIELDS)[number]

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

/**
 * Metric vocabulary for the `scores` stream (signals): occurrence `count`, the
 * `passRate`/`errorRate` over the pass/error flags, and stats over the 0–1 score
 * `value`. Distinct from the trace-family `MonitorMetric` (no duration/cost/tokens).
 */
export const scoreMetricSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count") }),
  z.object({ kind: z.literal("passRate") }),
  z.object({ kind: z.literal("errorRate") }),
  z.object({ kind: z.literal("avg"), field: z.literal("value") }),
  z.object({ kind: z.literal("min"), field: z.literal("value") }),
  z.object({ kind: z.literal("max"), field: z.literal("value") }),
  z.object({ kind: z.literal("median"), field: z.literal("value") }),
])
export type ScoreMetric = z.infer<typeof scoreMetricSchema>

/**
 * Metric vocabulary for the `behaviors` stream (taxonomy observations): occurrence
 * `count` and stats over the 0–1 `confidence` of the cluster assignment.
 */
export const behaviorMetricSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count") }),
  z.object({ kind: z.literal("avg"), field: z.literal("confidence") }),
  z.object({ kind: z.literal("min"), field: z.literal("confidence") }),
  z.object({ kind: z.literal("max"), field: z.literal("confidence") }),
  z.object({ kind: z.literal("median"), field: z.literal("confidence") }),
])
export type BehaviorMetric = z.infer<typeof behaviorMetricSchema>

/**
 * Metric vocabulary for the `moments` stream (semantic-moment labels): occurrence
 * `count` and stats over the 0–1 label `confidence` or the joined moment's 0–1
 * `coherence`. Values stay raw (0–1), like scores/behaviors.
 */
export const momentMetricSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count") }),
  z.object({ kind: z.literal("avg"), field: z.enum(["confidence", "coherence"]) }),
  z.object({ kind: z.literal("min"), field: z.enum(["confidence", "coherence"]) }),
  z.object({ kind: z.literal("max"), field: z.enum(["confidence", "coherence"]) }),
  z.object({ kind: z.literal("median"), field: z.enum(["confidence", "coherence"]) }),
])
export type MomentMetric = z.infer<typeof momentMetricSchema>

/** The metric union across every analytics stream. */
export type AnalyticsMetric = MonitorMetric | ScoreMetric | BehaviorMetric | MomentMetric

const rangeSchema = z
  .object({
    fromIso: z.iso.datetime().describe("Inclusive lower bound (ISO-8601)."),
    toIso: z.iso.datetime().describe("Exclusive upper bound (ISO-8601). Must be after `fromIso`."),
  })
  .describe("The time window.")

// Fields common to every stream (metric is per-stream, added on each variant).
const commonFields = {
  filters: filterSetSchema
    .optional()
    .describe("Structured filter set applied to the stream (same DSL as `listTraces`)."),
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

const traceFamilyMetric = monitorMetricSchema.describe(
  "The metric: `count`, `errorRate`, `cacheHitRate`, `{sum|min|max|avg|median}` over `duration`/`cost`/`tokens`, or `{kind:'percentile',field,p}` for an arbitrary percentile (`p` in [1,99]; e.g. `p:95`).",
)

const semanticQuery = z
  .string()
  .min(1)
  .max(500)
  .describe("Semantic search query, combined with `filters` via AND. Ranks/filters by relevance.")

/**
 * One composable analytics query, discriminated by `stream` so each stream
 * declares exactly what it supports: `traces` accepts a semantic `query` + a
 * `breakdown`; `sessions` accepts a `query` + breakdowns (minus `name`); `spans`
 * accepts breakdowns incl. the span-only `operation`; `scores` (the signal grain)
 * accepts signal-shaped metrics + breakdowns. The shape is self-describing to
 * MCP/SDK consumers. Range ordering (`fromIso` < `toIso`) is enforced at the
 * boundary.
 */
export const analyticsQuerySchema = z.discriminatedUnion("stream", [
  z
    .object({
      stream: z.literal("traces"),
      query: semanticQuery.optional(),
      breakdown: z.enum(TRACE_BREAKDOWN_FIELDS).optional().describe("Dimension to group by, one row per value."),
      metric: traceFamilyMetric,
      ...commonFields,
    })
    .strict(),
  z
    .object({
      stream: z.literal("sessions"),
      query: semanticQuery.optional(),
      breakdown: z.enum(SESSION_BREAKDOWN_FIELDS).optional().describe("Dimension to group by, one row per value."),
      metric: traceFamilyMetric,
      ...commonFields,
    })
    .strict(),
  z
    .object({
      stream: z.literal("spans"),
      breakdown: z.enum(SPAN_BREAKDOWN_FIELDS).optional().describe("Dimension to group by, one row per value."),
      metric: traceFamilyMetric,
      ...commonFields,
    })
    .strict(),
  z
    .object({
      stream: z
        .literal("scores")
        .describe(
          'Scored occurrences. A **signal** is scores carrying a `signalId` — analyze one signal with `stream: "scores"` filtered by `score.signalId` (or broken down by `signalId`).',
        ),
      breakdown: z
        .enum(SCORE_BREAKDOWN_FIELDS)
        .optional()
        .describe(
          "Dimension to group by: `signalId`/`source` (direct) or a trace dim (`model`…`tag`) via the score's trace.",
        ),
      metric: scoreMetricSchema.describe(
        "The metric: `count`, `passRate`, `errorRate` (over the pass/error flags), or `{avg|min|max|median}` of the 0–1 score `value`.",
      ),
      ...commonFields,
    })
    .strict(),
  z
    .object({
      stream: z
        .literal("behaviors")
        .describe("Taxonomy observations — behavior instances clustered from session moments."),
      breakdown: z
        .enum(BEHAVIOR_BREAKDOWN_FIELDS)
        .optional()
        .describe("Dimension to group by: `cluster` (the behavior cluster), `session`, or `method`."),
      metric: behaviorMetricSchema.describe(
        "The metric: `count`, or `{avg|min|max|median}` of the 0–1 assignment `confidence`.",
      ),
      ...commonFields,
    })
    .strict(),
  z
    .object({
      stream: z
        .literal("moments")
        .describe("Semantic-moment labels — kind/actor-tagged moments detected within a session."),
      breakdown: z
        .enum(MOMENT_BREAKDOWN_FIELDS)
        .optional()
        .describe("Dimension to group by: `kind` (frequency/escalation/…), `actor`, or `session`."),
      metric: momentMetricSchema.describe(
        "The metric: `count`, or `{avg|min|max|median}` of the 0–1 label `confidence` or moment `coherence`.",
      ),
      ...commonFields,
    })
    .strict(),
])

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>

/** Every stream the analytics query supports (superset of the monitor streams). */
export type AnalyticsStream = AnalyticsQuery["stream"]

/** `true` when `fromIso` is strictly before `toIso`. Enforced at the request boundary. */
export const isValidAnalyticsRange = (range: { fromIso: string; toIso: string }): boolean =>
  new Date(range.fromIso).getTime() < new Date(range.toIso).getTime()

/** One output row: a breakdown key and/or a time bucket, with the metric value. */
export interface AnalyticsSeriesPoint {
  readonly key?: string
  readonly bucketStart?: string
  readonly value: number
}
