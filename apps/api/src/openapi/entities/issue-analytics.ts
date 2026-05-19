import type { GetIssueAnalyticsResult } from "@domain/issues"
import { z } from "@hono/zod-openapi"

const IssueAnalyticsBucketSchema = z
  .object({
    bucket: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
    value: z.number().int().nonnegative().describe("Number of occurrences in this bucket."),
  })
  .openapi("IssueAnalyticsBucket")

const IssueAnalyticsCountMetricSchema = (totalDescription: string) =>
  z.object({
    total: z.number().int().nonnegative().describe(totalDescription),
  })

export const IssueAnalyticsResponseSchema = z
  .object({
    ongoing: IssueAnalyticsCountMetricSchema("Number of ongoing issues.").openapi("IssueAnalyticsOngoing"),
    new: IssueAnalyticsCountMetricSchema("Number of new issues.").openapi("IssueAnalyticsNew"),
    escalating: IssueAnalyticsCountMetricSchema("Number of escalating issues.").openapi("IssueAnalyticsEscalating"),
    regressed: IssueAnalyticsCountMetricSchema("Number of regressed issues.").openapi("IssueAnalyticsRegressed"),
    resolved: IssueAnalyticsCountMetricSchema("Number of resolved issues.").openapi("IssueAnalyticsResolved"),
    occurrences: z
      .object({
        total: z.number().int().nonnegative().describe("Number of issue occurrences in the range."),
        buckets: z.array(IssueAnalyticsBucketSchema).describe("Number of issue occurrences per bucket."),
      })
      .openapi("IssueAnalyticsOccurrences"),
  })
  .openapi("IssueAnalyticsResponse")

export const toIssueAnalyticsResponse = (analytics: GetIssueAnalyticsResult) => ({
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
