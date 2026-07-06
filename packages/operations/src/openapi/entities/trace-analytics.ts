import type { GetTraceAnalyticsResult } from "@domain/spans"
import { z } from "@hono/zod-openapi"

const TraceAnalyticsBucketSchema = z
  .object({
    bucket: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
    value: z.number().describe("Metric value for this bucket."),
  })
  .openapi("TraceAnalyticsBucket")

const buildTotalMetric = (totalDescription: string, bucketsDescription: string) =>
  z.object({
    total: z.number().describe(totalDescription),
    buckets: z.array(TraceAnalyticsBucketSchema).describe(bucketsDescription),
  })

const buildMedianMetric = (medianDescription: string, bucketsDescription: string) =>
  z.object({
    median: z.number().describe(medianDescription),
    buckets: z.array(TraceAnalyticsBucketSchema).describe(bucketsDescription),
  })

export const TraceAnalyticsResponseSchema = z
  .object({
    traces: buildTotalMetric("Number of traces in the range.", "Number of traces per bucket.").openapi(
      "TraceAnalyticsTraces",
    ),
    cost: buildTotalMetric("Total trace cost in USD.", "Trace cost per bucket in USD.").openapi("TraceAnalyticsCost"),
    duration: buildMedianMetric(
      "Median trace duration in seconds.",
      "Median trace duration per bucket in seconds.",
    ).openapi("TraceAnalyticsDuration"),
    tokens: buildTotalMetric("Total tokens across all LLM spans.", "Tokens per bucket across all LLM spans.").openapi(
      "TraceAnalyticsTokens",
    ),
    timeToFirstToken: buildMedianMetric(
      "Median time-to-first-token across LLM spans, in seconds.",
      "Median time-to-first-token per bucket, in seconds.",
    ).openapi("TraceAnalyticsTimeToFirstToken"),
    spans: buildTotalMetric("Total number of spans.", "Number of spans per bucket.").openapi("TraceAnalyticsSpans"),
  })
  .openapi("TraceAnalyticsResponse")

export const toTraceAnalyticsResponse = (analytics: GetTraceAnalyticsResult) => ({
  traces: {
    total: analytics.traces.total,
    buckets: analytics.traces.buckets.map((b) => ({ bucket: b.bucket, value: b.value })),
  },
  cost: {
    total: analytics.cost.total,
    buckets: analytics.cost.buckets.map((b) => ({ bucket: b.bucket, value: b.value })),
  },
  duration: {
    median: analytics.duration.median,
    buckets: analytics.duration.buckets.map((b) => ({ bucket: b.bucket, value: b.value })),
  },
  tokens: {
    total: analytics.tokens.total,
    buckets: analytics.tokens.buckets.map((b) => ({ bucket: b.bucket, value: b.value })),
  },
  timeToFirstToken: {
    median: analytics.timeToFirstToken.median,
    buckets: analytics.timeToFirstToken.buckets.map((b) => ({ bucket: b.bucket, value: b.value })),
  },
  spans: {
    total: analytics.spans.total,
    buckets: analytics.spans.buckets.map((b) => ({ bucket: b.bucket, value: b.value })),
  },
})
