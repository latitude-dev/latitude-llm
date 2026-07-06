import { cuidSchema } from "@domain/shared"
import type { GetSignalTrendResult, SignalDetails, SignalListItem } from "@domain/signals"
import { SIGNAL_SOURCES, SIGNAL_STATES } from "@domain/signals"
import { z } from "@hono/zod-openapi"
import { Paginated } from "../pagination.ts"
import { EvaluationSchema, toEvaluationResponse } from "./evaluation.ts"

const TrendBucketSchema = z
  .object({
    bucket: z.string().describe("UTC day bucket (`YYYY-MM-DD`)."),
    count: z.number().int().nonnegative().describe("Number of occurrences within the bucket."),
  })
  .openapi("SignalTrendBucket")

const SignalHistogramBucketSchema = z
  .object({
    bucket: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
    count: z.number().int().nonnegative().describe("Number of occurrences within the bucket."),
  })
  .openapi("SignalHistogramBucket")

export const SignalHistogramSchema = z
  .object({
    buckets: z
      .array(SignalHistogramBucketSchema)
      .describe(
        "One entry per 12-hour UTC-aligned bucket in the requested range, including empty buckets (`count: 0`).",
      ),
  })
  .openapi("SignalHistogram")

export const toSignalHistogramResponse = (trend: GetSignalTrendResult) => ({
  buckets: trend.buckets.map((bucket) => ({ bucket: bucket.bucket, count: bucket.count })),
})

const SignalMonitoringStateSchema = z
  .discriminatedUnion("kind", [
    z
      .object({ kind: z.literal("automatic") })
      .describe("The signal is automatically monitored by the system and does not need an evaluation."),
    z.object({ kind: z.literal("idle") }).describe("The signal is not currently being monitored."),
    z
      .object({ kind: z.literal("generating") })
      .describe("An evaluation is being generated for this signal. The signal has no active evaluation yet."),
    z
      .object({
        kind: z.literal("realigning"),
        evaluationId: cuidSchema.describe("Id of the evaluation currently being realigned."),
      })
      .describe("An active evaluation is being realigned."),
  ])
  .openapi("SignalMonitoringState")

// Fields shared by the list-row (`Signal`) and the detail (`SignalDetail`) shapes.
const signalCoreFields = {
  id: cuidSchema.describe("Stable signal identifier."),
  organizationId: cuidSchema.describe("Organization that owns this signal."),
  projectId: cuidSchema.describe("Project this signal belongs to."),
  slug: z.string().describe("URL-safe slug derived from `name`. Unique within the project."),
  name: z.string().describe("Human-readable name."),
  description: z.string().describe("Description of the signal."),
  source: z.enum(SIGNAL_SOURCES).describe("Where the signal originated from."),
  states: z
    .array(z.enum(SIGNAL_STATES))
    .describe("Active lifecycle states. A signal may carry multiple states at once (e.g. `escalating` + `ongoing`)."),
  mutedAt: z.string().nullable().describe("ISO-8601 timestamp at which the signal was muted, or `null`."),
  createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
  trend: z.array(TrendBucketSchema).describe("Daily occurrence counts over the past 14 days."),
  tags: z.array(z.string()).describe("Tags seen on the signal's occurrences."),
} as const

// Fields scoped to the list endpoint: time-windowed activity stats for the
// page (rolled up against the user-selected `fromIso` / `toIso` range).
const signalListFields = {
  ...signalCoreFields,
  firstSeenAt: z.string().describe("ISO-8601 timestamp of the earliest occurrence in the time window."),
  lastSeenAt: z.string().describe("ISO-8601 timestamp of the latest occurrence in the time window."),
  occurrences: z.number().int().nonnegative().describe("Number of occurrences in the time window."),
  affectedSessionsPercent: z
    .number()
    .min(0)
    .max(1)
    .describe("Fraction of project sessions affected by this signal in the time window, in `[0, 1]`."),
} as const

// Detail-endpoint fields: full-history versions of every list stat plus
// monitoring info. Same field names as the list so downstream tooling can
// share types; semantics are "lifetime" rather than "windowed".
const signalDetailFields = {
  ...signalCoreFields,
  firstSeenAt: z
    .string()
    .nullable()
    .describe("ISO-8601 timestamp of the earliest occurrence over the signal's lifetime, or `null` if none yet."),
  lastSeenAt: z
    .string()
    .nullable()
    .describe("ISO-8601 timestamp of the latest occurrence over the signal's lifetime, or `null` if none yet."),
  occurrences: z.number().int().nonnegative().describe("Lifetime occurrence count."),
  affectedSessionsPercent: z
    .number()
    .min(0)
    .max(1)
    .describe("Lifetime fraction of project sessions affected by this signal, in `[0, 1]`."),
  evaluations: z
    .array(EvaluationSchema)
    .describe("Active evaluations monitoring the signal. Archived and deleted evaluations are excluded."),
  monitoringState: SignalMonitoringStateSchema.describe(
    "Whether the signal is currently being monitored: `automatic`, `idle`, `generating`, or `realigning`.",
  ),
} as const

const SignalSchema = z.object(signalListFields).openapi("Signal")

export const SignalDetailSchema = z.object(signalDetailFields).openapi("SignalDetail")

export const PaginatedSignalsSchema = Paginated(SignalSchema, "PaginatedSignals")

export const toSignalResponse = (item: SignalListItem, organizationId: string) => ({
  id: item.id,
  organizationId,
  projectId: item.projectId,
  slug: item.slug,
  name: item.name,
  description: item.description,
  source: item.source,
  states: [...item.states],
  mutedAt: item.mutedAt ? item.mutedAt.toISOString() : null,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  firstSeenAt: item.firstSeenAt.toISOString(),
  lastSeenAt: item.lastSeenAt.toISOString(),
  occurrences: item.occurrences,
  affectedSessionsPercent: item.affectedSessionsPercent,
  trend: item.trend.map((bucket) => ({ bucket: bucket.bucket, count: bucket.count })),
  tags: [...item.tags],
})

export const toSignalDetailResponse = (details: SignalDetails, organizationId: string) => ({
  id: details.issue.id as string,
  organizationId,
  projectId: details.issue.projectId as string,
  slug: details.issue.slug,
  name: details.issue.name,
  description: details.issue.description,
  source: details.issue.source,
  states: [...details.states],
  mutedAt: details.issue.mutedAt ? details.issue.mutedAt.toISOString() : null,
  createdAt: details.issue.createdAt.toISOString(),
  updatedAt: details.issue.updatedAt.toISOString(),
  firstSeenAt: details.firstSeenAt ? details.firstSeenAt.toISOString() : null,
  lastSeenAt: details.lastSeenAt ? details.lastSeenAt.toISOString() : null,
  occurrences: details.occurrences,
  affectedSessionsPercent: details.affectedSessionsPercent,
  tags: [...details.tags],
  trend: details.trend.map((bucket) => ({ bucket: bucket.bucket, count: bucket.count })),
  evaluations: details.evaluations.map(toEvaluationResponse),
  monitoringState:
    details.alignmentState.kind === "realigning"
      ? { kind: "realigning" as const, evaluationId: details.alignmentState.evaluationId }
      : { kind: details.alignmentState.kind as "automatic" | "idle" | "generating" },
})
