import type { GetSessionAnalyticsResult } from "@domain/spans"
import { z } from "@hono/zod-openapi"

const SessionAnalyticsBucketSchema = z
  .object({
    bucket: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
    value: z.number().describe("Metric value for this bucket."),
  })
  .openapi("SessionAnalyticsBucket")

const buildTotalMetric = (totalDescription: string, bucketsDescription: string) =>
  z.object({
    total: z.number().describe(totalDescription),
    buckets: z.array(SessionAnalyticsBucketSchema).describe(bucketsDescription),
  })

const buildMedianMetric = (medianDescription: string, bucketsDescription: string) =>
  z.object({
    median: z.number().describe(medianDescription),
    buckets: z.array(SessionAnalyticsBucketSchema).describe(bucketsDescription),
  })

export const SessionAnalyticsResponseSchema = z
  .object({
    sessions: buildTotalMetric("Number of sessions in the range.", "Number of sessions per bucket.").openapi(
      "SessionAnalyticsSessions",
    ),
    traces: buildTotalMetric("Number of traces across the range's sessions.", "Number of traces per bucket.").openapi(
      "SessionAnalyticsTraces",
    ),
    cost: buildTotalMetric("Total session cost in USD.", "Session cost per bucket in USD.").openapi(
      "SessionAnalyticsCost",
    ),
    duration: buildMedianMetric(
      "Median session duration in seconds.",
      "Median session duration per bucket in seconds.",
    ).openapi("SessionAnalyticsDuration"),
    tokens: buildTotalMetric("Total tokens across all LLM spans.", "Tokens per bucket across all LLM spans.").openapi(
      "SessionAnalyticsTokens",
    ),
    timeToFirstToken: buildMedianMetric(
      "Median time-to-first-token across LLM spans, in seconds.",
      "Median time-to-first-token per bucket, in seconds.",
    ).openapi("SessionAnalyticsTimeToFirstToken"),
    spans: buildTotalMetric("Total number of spans.", "Number of spans per bucket.").openapi("SessionAnalyticsSpans"),
  })
  .openapi("SessionAnalyticsResponse")

export const toSessionAnalyticsResponse = (analytics: GetSessionAnalyticsResult) => ({
  sessions: {
    total: analytics.sessions.total,
    buckets: analytics.sessions.buckets.map((b) => ({ bucket: b.bucket, value: b.value })),
  },
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
