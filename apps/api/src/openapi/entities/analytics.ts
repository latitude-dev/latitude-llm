import {
  ANALYTICS_DEFAULT_LIMIT,
  ANALYTICS_MAX_LIMIT,
  type AnalyticsSeriesPoint,
  analyticsOrderBySchema,
  analyticsTimeBucketSchema,
  BEHAVIOR_BREAKDOWN_FIELDS,
  behaviorMetricSchema,
  MOMENT_BREAKDOWN_FIELDS,
  momentMetricSchema,
  monitorMetricSchema,
  SCORE_BREAKDOWN_FIELDS,
  SESSION_BREAKDOWN_FIELDS,
  SPAN_BREAKDOWN_FIELDS,
  scoreMetricSchema,
  TRACE_BREAKDOWN_FIELDS,
} from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { FilterSetSchema } from "../schemas.ts"

// The OpenAPI/MCP request body. A discriminated union on `stream`, mirroring the
// domain `analyticsQuerySchema`, but built with the API `FilterSetSchema` (Fern
// emits a clean item type for it — the domain filter schema is a refined record
// that the SDK generator can't name). Cross-field rules (range ordering) and the
// domain filter constraints are re-checked in the handler via the domain schema.
// `metric` is per-stream (added on each variant), so it lives outside `commonFields`.
const commonFields = {
  filters: FilterSetSchema.optional().describe(
    "Structured filter set applied to the stream (same DSL as `listTraces`).",
  ),
  timeBucket: analyticsTimeBucketSchema
    .optional()
    .describe("Bucket the metric over time. Omit for a single aggregate."),
  range: z
    .object({
      fromIso: z.iso
        .datetime()
        .openapi({ example: "2026-06-23T00:00:00Z" })
        .describe("Inclusive lower bound (ISO-8601)."),
      toIso: z.iso
        .datetime()
        .openapi({ example: "2026-06-30T00:00:00Z" })
        .describe("Exclusive upper bound (ISO-8601). Must be after `fromIso`."),
    })
    .describe("The time window."),
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

export const AnalyticsQueryBodySchema = z
  .discriminatedUnion("stream", [
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
            'Scored occurrences. A signal is scores carrying a `signalId` — analyze one signal via `stream: "scores"` filtered by `score.signalId` (or broken down by `signalId`).',
          ),
        breakdown: z
          .enum(SCORE_BREAKDOWN_FIELDS)
          .optional()
          .describe("Dimension to group by: `signalId`/`source` (direct) or a trace dim (`model`…`tag`)."),
        metric: scoreMetricSchema.describe(
          "The metric: `count`, `passRate`, `errorRate`, or `{avg|min|max|median}` of the 0–1 score `value`.",
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
          .describe("Dimension to group by: `cluster`, `session`, or `method`."),
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
          .describe("Dimension to group by: `kind`, `actor`, or `session`."),
        metric: momentMetricSchema.describe(
          "The metric: `count`, or `{avg|min|max|median}` of the 0–1 label `confidence` or moment `coherence`.",
        ),
        ...commonFields,
      })
      .strict(),
  ])
  .openapi("AnalyticsQuery")

export const AnalyticsSeriesResponseSchema = z
  .object({
    series: z
      .array(
        z.object({
          key: z.string().optional().describe("The breakdown value, present when `breakdown` was set."),
          label: z
            .string()
            .optional()
            .describe(
              "Human-readable name for `key` when the breakdown value is an opaque id — the signal name for `signalId`, the cluster name for `cluster`. Absent for already-readable breakdowns.",
            ),
          bucketStart: z
            .string()
            .optional()
            .describe("ISO-8601 start of the time bucket, present when `timeBucket` was set."),
          value: z
            .number()
            .describe(
              "The metric value: seconds for `duration`, dollars for `cost`, a 0–1 ratio for `errorRate`/`cacheHitRate`, otherwise a raw count/token total.",
            ),
        }),
      )
      .describe("Tidy series: one point per breakdown key and/or time bucket."),
  })
  .openapi("AnalyticsSeries")

export const toAnalyticsResponse = (series: readonly AnalyticsSeriesPoint[], labels?: ReadonlyMap<string, string>) => ({
  series: series.map((point) => ({
    ...(point.key !== undefined ? { key: point.key } : {}),
    ...(point.key !== undefined && labels?.get(point.key) ? { label: labels.get(point.key) } : {}),
    ...(point.bucketStart !== undefined ? { bucketStart: point.bucketStart } : {}),
    value: point.value,
  })),
})
