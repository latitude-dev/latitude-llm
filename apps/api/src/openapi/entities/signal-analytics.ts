import type { GetSignalAnalyticsResult } from "@domain/signals"
import { z } from "@hono/zod-openapi"

const SignalAnalyticsBucketSchema = z
  .object({
    bucket: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
    value: z.number().int().nonnegative().describe("Number of occurrences in this bucket."),
  })
  .openapi("SignalAnalyticsBucket")

const SignalAnalyticsCountMetricSchema = (totalDescription: string) =>
  z.object({
    total: z.number().int().nonnegative().describe(totalDescription),
  })

export const SignalAnalyticsResponseSchema = z
  .object({
    ongoing: SignalAnalyticsCountMetricSchema("Number of ongoing issues.").openapi("SignalAnalyticsOngoing"),
    new: SignalAnalyticsCountMetricSchema("Number of new issues.").openapi("SignalAnalyticsNew"),
    escalating: SignalAnalyticsCountMetricSchema("Number of escalating issues.").openapi("SignalAnalyticsEscalating"),
    regressed: SignalAnalyticsCountMetricSchema("Number of regressed issues.").openapi("SignalAnalyticsRegressed"),
    resolved: SignalAnalyticsCountMetricSchema("Number of resolved issues.").openapi("SignalAnalyticsResolved"),
    occurrences: z
      .object({
        total: z.number().int().nonnegative().describe("Number of issue occurrences in the range."),
        buckets: z.array(SignalAnalyticsBucketSchema).describe("Number of issue occurrences per bucket."),
      })
      .openapi("SignalAnalyticsOccurrences"),
  })
  .openapi("SignalAnalyticsResponse")

export const toSignalAnalyticsResponse = (analytics: GetSignalAnalyticsResult) => ({
  ongoing: { total: analytics.ongoing.total },
  new: { total: analytics.new.total },
  escalating: { total: analytics.escalating.total },
  regressed: { total: analytics.regressed.total },
  resolved: { total: analytics.resolved.total },
  occurrences: {
    total: analytics.occurrences.total,
    buckets: analytics.occurrences.buckets.map((b) => ({ bucket: b.bucket, value: b.value })),
  },
})
