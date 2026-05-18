import type { GetIssueTrendResult, IssueDetails, IssueListItem } from "@domain/issues"
import { ISSUE_SOURCES, ISSUE_STATES } from "@domain/issues"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { Paginated } from "../pagination.ts"
import { EvaluationSchema, toEvaluationResponse } from "./evaluation.ts"

const TrendBucketSchema = z
  .object({
    bucket: z.string().describe("UTC day bucket (`YYYY-MM-DD`)."),
    count: z.number().int().nonnegative().describe("Number of occurrences within the bucket."),
  })
  .openapi("IssueTrendBucket")

const IssueHistogramBucketSchema = z
  .object({
    bucket: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
    count: z.number().int().nonnegative().describe("Number of occurrences within the bucket."),
  })
  .openapi("IssueHistogramBucket")

export const IssueHistogramSchema = z
  .object({
    buckets: z
      .array(IssueHistogramBucketSchema)
      .describe(
        "One entry per 12-hour UTC-aligned bucket in the requested range, including empty buckets (`count: 0`).",
      ),
  })
  .openapi("IssueHistogram")

export const toIssueHistogramResponse = (trend: GetIssueTrendResult) => ({
  buckets: trend.buckets.map((bucket) => ({ bucket: bucket.bucket, count: bucket.count })),
})

const IssueMonitoringStateSchema = z
  .discriminatedUnion("kind", [
    z
      .object({ kind: z.literal("automatic") })
      .describe("The issue is automatically monitored by the system and does not need an evaluation."),
    z.object({ kind: z.literal("idle") }).describe("The issue is not currently being monitored."),
    z
      .object({ kind: z.literal("generating") })
      .describe("An evaluation is being generated for this issue. The issue has no active evaluation yet."),
    z
      .object({
        kind: z.literal("realigning"),
        evaluationId: cuidSchema.describe("Id of the evaluation currently being realigned."),
      })
      .describe("An active evaluation is being realigned."),
  ])
  .openapi("IssueMonitoringState")

// Fields shared by the list-row (`Issue`) and the detail (`IssueDetail`) shapes.
const issueCoreFields = {
  id: cuidSchema.describe("Stable issue identifier."),
  organizationId: cuidSchema.describe("Organization that owns this issue."),
  projectId: cuidSchema.describe("Project this issue belongs to."),
  slug: z.string().describe("URL-safe slug derived from `name`. Unique within the project."),
  name: z.string().describe("Human-readable name."),
  description: z.string().describe("Description of the issue."),
  source: z.enum(ISSUE_SOURCES).describe("Where the issue originated from."),
  states: z
    .array(z.enum(ISSUE_STATES))
    .describe("Active lifecycle states. An issue may carry multiple states at once (e.g. `escalating` + `ongoing`)."),
  resolvedAt: z.string().nullable().describe("ISO-8601 timestamp at which the issue was resolved, or `null`."),
  ignoredAt: z.string().nullable().describe("ISO-8601 timestamp at which the issue was ignored, or `null`."),
  createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
  trend: z.array(TrendBucketSchema).describe("Daily occurrence counts over the past 14 days."),
  tags: z.array(z.string()).describe("Tags seen on the issue's occurrences."),
} as const

// Fields scoped to the list endpoint: time-windowed activity stats for the
// page (rolled up against the user-selected `fromIso` / `toIso` range).
const issueListFields = {
  ...issueCoreFields,
  firstSeenAt: z.string().describe("ISO-8601 timestamp of the earliest occurrence in the time window."),
  lastSeenAt: z.string().describe("ISO-8601 timestamp of the latest occurrence in the time window."),
  occurrences: z.number().int().nonnegative().describe("Number of occurrences in the time window."),
  affectedTracesPercent: z
    .number()
    .min(0)
    .max(1)
    .describe("Fraction of project traces affected by this issue in the time window, in `[0, 1]`."),
} as const

// Detail-endpoint fields: full-history versions of every list stat plus
// monitoring info. Same field names as the list so downstream tooling can
// share types; semantics are "lifetime" rather than "windowed".
const issueDetailFields = {
  ...issueCoreFields,
  firstSeenAt: z
    .string()
    .nullable()
    .describe("ISO-8601 timestamp of the earliest occurrence over the issue's lifetime, or `null` if none yet."),
  lastSeenAt: z
    .string()
    .nullable()
    .describe("ISO-8601 timestamp of the latest occurrence over the issue's lifetime, or `null` if none yet."),
  occurrences: z.number().int().nonnegative().describe("Lifetime occurrence count."),
  affectedTracesPercent: z
    .number()
    .min(0)
    .max(1)
    .describe("Lifetime fraction of project traces affected by this issue, in `[0, 1]`."),
  evaluations: z
    .array(EvaluationSchema)
    .describe("Active evaluations monitoring the issue. Archived and deleted evaluations are excluded."),
  monitoringState: IssueMonitoringStateSchema.describe(
    "Whether the issue is currently being monitored: `automatic`, `idle`, `generating`, or `realigning`.",
  ),
} as const

const IssueSchema = z.object(issueListFields).openapi("Issue")

export const IssueDetailSchema = z.object(issueDetailFields).openapi("IssueDetail")

export const PaginatedIssuesSchema = Paginated(IssueSchema, "PaginatedIssues")

export const toIssueResponse = (item: IssueListItem, organizationId: string) => ({
  id: item.id,
  organizationId,
  projectId: item.projectId,
  slug: item.slug,
  name: item.name,
  description: item.description,
  source: item.source,
  states: [...item.states],
  resolvedAt: item.resolvedAt ? item.resolvedAt.toISOString() : null,
  ignoredAt: item.ignoredAt ? item.ignoredAt.toISOString() : null,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  firstSeenAt: item.firstSeenAt.toISOString(),
  lastSeenAt: item.lastSeenAt.toISOString(),
  occurrences: item.occurrences,
  affectedTracesPercent: item.affectedTracesPercent,
  trend: item.trend.map((bucket) => ({ bucket: bucket.bucket, count: bucket.count })),
  tags: [...item.tags],
})

export const toIssueDetailResponse = (details: IssueDetails, organizationId: string) => ({
  id: details.issue.id as string,
  organizationId,
  projectId: details.issue.projectId as string,
  slug: details.issue.slug,
  name: details.issue.name,
  description: details.issue.description,
  source: details.issue.source,
  states: [...details.states],
  resolvedAt: details.issue.resolvedAt ? details.issue.resolvedAt.toISOString() : null,
  ignoredAt: details.issue.ignoredAt ? details.issue.ignoredAt.toISOString() : null,
  createdAt: details.issue.createdAt.toISOString(),
  updatedAt: details.issue.updatedAt.toISOString(),
  firstSeenAt: details.firstSeenAt ? details.firstSeenAt.toISOString() : null,
  lastSeenAt: details.lastSeenAt ? details.lastSeenAt.toISOString() : null,
  occurrences: details.occurrences,
  affectedTracesPercent: details.affectedTracesPercent,
  tags: [...details.tags],
  trend: details.trend.map((bucket) => ({ bucket: bucket.bucket, count: bucket.count })),
  evaluations: details.evaluations.map(toEvaluationResponse),
  monitoringState:
    details.alignmentState.kind === "realigning"
      ? { kind: "realigning" as const, evaluationId: details.alignmentState.evaluationId }
      : { kind: details.alignmentState.kind as "automatic" | "idle" | "generating" },
})
