import {
  ANALYTICS_DEFAULT_LIMIT,
  ANALYTICS_MAX_LIMIT,
  type AnalyticsSeriesPoint,
  analyticsOrderBySchema,
  analyticsTimeBucketSchema,
  monitorMetricSchema,
  SESSION_BREAKDOWN_FIELDS,
  SPAN_BREAKDOWN_FIELDS,
  TRACE_BREAKDOWN_FIELDS,
} from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { FilterSetSchema } from "../schemas.ts"

// The OpenAPI/MCP request body. A discriminated union on `stream`, mirroring the
// domain `analyticsQuerySchema`, but built with the API `FilterSetSchema` (Fern
// emits a clean item type for it — the domain filter schema is a refined record
// that the SDK generator can't name). Cross-field rules (range ordering) and the
// domain filter constraints are re-checked in the handler via the domain schema.
const sharedFields = {
  filters: FilterSetSchema.optional().describe(
    "Structured filter set applied to the stream (same DSL as `listTraces`).",
  ),
  metric: monitorMetricSchema.describe(
    "The metric: `count`, `errorRate`, `cacheHitRate`, or `{sum|min|max|avg|median}` over `duration`/`cost`/`tokens`.",
  ),
  timeBucket: analyticsTimeBucketSchema
    .optional()
    .describe("Bucket the metric over time. Omit for a single aggregate."),
  range: z
    .object({
      fromIso: z.iso.datetime().describe("Inclusive lower bound (ISO-8601)."),
      toIso: z.iso.datetime().describe("Exclusive upper bound (ISO-8601). Must be after `fromIso`."),
    })
    .describe("The time window."),
  orderBy: analyticsOrderBySchema.optional().describe("Sort for breakdown results. Defaults to value-desc."),
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

export const AnalyticsQueryBodySchema = z
  .discriminatedUnion("stream", [
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
  .openapi("AnalyticsQuery")

export const AnalyticsSeriesResponseSchema = z
  .object({
    series: z
      .array(
        z.object({
          key: z.string().optional().describe("The breakdown value, present when `breakdown` was set."),
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

export const toAnalyticsResponse = (series: readonly AnalyticsSeriesPoint[]) => ({
  series: series.map((point) => ({
    ...(point.key !== undefined ? { key: point.key } : {}),
    ...(point.bucketStart !== undefined ? { bucketStart: point.bucketStart } : {}),
    value: point.value,
  })),
})
