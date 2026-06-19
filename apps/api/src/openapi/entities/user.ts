import type { UserSignalItem } from "@domain/signals"
import type {
  ProjectUserSummary,
  UserActivitySeries,
  UserCostRollup,
  UserListPage,
  UserProfile,
  UsersOverview,
  UserUsageSlice,
} from "@domain/spans"
import type { UserBehaviourItem } from "@domain/taxonomy"
import { z } from "@hono/zod-openapi"

const HOUR_SECONDS = 60 * 60
const DAY_SECONDS = 24 * HOUR_SECONDS

/** Default analytics window when the caller omits `fromIso`/`toIso`. */
const DEFAULT_USERS_RANGE_DAYS = 30

/** Hourly buckets for ranges up to ~2 days, daily above — matches the web users section. */
export const bucketSecondsForRange = (from: Date, to: Date): number =>
  to.getTime() - from.getTime() <= 49 * HOUR_SECONDS * 1000 ? HOUR_SECONDS : DAY_SECONDS

/** `to` defaults to now; `from` defaults to `DEFAULT_USERS_RANGE_DAYS` before `to`. */
export const resolveUserRange = (fromIso?: string, toIso?: string): { from: Date; to: Date } => {
  const to = toIso ? new Date(toIso) : new Date()
  const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - DEFAULT_USERS_RANGE_DAYS * DAY_SECONDS * 1000)
  return { from, to }
}

const CostRollupSchema = z
  .object({
    sum: z.number().describe("Sum of every matching user's total cost, in microcents."),
    avg: z.number().describe("Mean of every matching user's mean per-trace cost, in microcents."),
    median: z.number().describe("Median of every matching user's median per-trace cost, in microcents."),
  })
  .openapi("UserCostRollup")

const ProjectUserSchema = z
  .object({
    userId: z.string().describe("The end-user's identifier, as reported on their traces' `user_id`."),
    userEmail: z.string().describe("Latest non-empty email seen on the user's traces. Empty when never reported."),
    firstSeenAt: z.string().describe("ISO-8601 timestamp of the user's first trace in the range."),
    lastSeenAt: z.string().describe("ISO-8601 timestamp of the user's most recent trace in the range."),
    traceCount: z.number().int().describe("Traces attributed to the user in the range."),
    sessionCount: z.number().int().describe("Distinct sessions in which the user produced at least one trace."),
    errorSessionCount: z.number().int().describe("Of `sessionCount`, sessions with at least one errored trace."),
    tokensTotal: z.number().int().describe("Total tokens across the user's traces."),
    costTotalMicrocents: z.number().describe("Total cost across the user's traces, in microcents."),
    costAvgMicrocents: z.number().describe("Mean per-trace cost across the user's traces, in microcents."),
    costMedianMicrocents: z.number().describe("Median (p50) per-trace cost across the user's traces, in microcents."),
  })
  .openapi("ProjectUser")

export const UserListResponseSchema = z
  .object({
    items: z.array(ProjectUserSchema).describe("Page of users, in the requested sort order."),
    totalCount: z.number().int().describe("Total users matching the filters across every page."),
    hasMore: z.boolean().describe("`true` when there is at least one more page after this one."),
    limit: z.number().int().describe("Page size used for this response."),
    offset: z.number().int().describe("Zero-based offset of the first item in this page."),
    costRollup: CostRollupSchema.describe("Cost aggregates across every matching user, not just this page."),
  })
  .openapi("UserListResponse")

const UsersOverviewBucketSchema = z
  .object({
    bucket: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
    activeUsers: z.number().int().describe("Distinct identified users active in the bucket."),
    traceCount: z.number().int().describe("Identified traces in the bucket."),
    sessionCount: z.number().int().describe("Distinct user-attributed sessions starting in the bucket."),
    errorSessionCount: z.number().int().describe("Of `sessionCount`, those with at least one errored trace."),
  })
  .openapi("UsersOverviewBucket")

export const UsersOverviewResponseSchema = z
  .object({
    uniqueUsers: z.number().int().describe("Distinct identified users with at least one trace in the range."),
    newUsers: z.number().int().describe("Users whose first trace ever falls inside the range."),
    identifiedTraces: z.number().int().describe("Traces in the range carrying a non-empty `user_id`."),
    totalTraces: z.number().int().describe("All traces in the range, identified or not."),
    identifiedSessions: z.number().int().describe("Distinct sessions in the range carrying a non-empty `user_id`."),
    totalSessions: z.number().int().describe("All distinct sessions in the range, identified or not."),
    histogram: z.array(UsersOverviewBucketSchema).describe("Per-bucket activity across the range, oldest first."),
    bucketSeconds: z.number().int().describe("Bucket width the histogram was computed with, in seconds."),
    fromIso: z.string().describe("ISO-8601 lower bound of the resolved range."),
    toIso: z.string().describe("ISO-8601 upper bound of the resolved range."),
  })
  .openapi("UsersOverviewResponse")

export const UserProfileResponseSchema = z
  .object({
    userId: z.string().describe("The end-user's identifier, as reported on their traces' `user_id`."),
    userEmail: z.string().describe("Latest non-empty email seen on the user's traces. Empty when never reported."),
    firstSeenAt: z.string().describe("ISO-8601 timestamp of the user's first trace ever."),
    lastSeenAt: z.string().describe("ISO-8601 timestamp of the user's most recent trace ever."),
    traceCount: z.number().int().describe("Lifetime traces attributed to the user."),
    sessionCount: z.number().int().describe("Distinct sessions in which the user produced at least one trace."),
    errorSessionCount: z.number().int().describe("Of `sessionCount`, sessions with at least one errored trace."),
    tokensTotal: z.number().int().describe("Total tokens across the user's traces."),
    tokensInput: z.number().int().describe("Input (prompt) tokens across the user's traces."),
    tokensOutput: z.number().int().describe("Output (completion) tokens across the user's traces."),
    costTotalMicrocents: z.number().describe("Total cost across the user's traces, in microcents."),
    avgDurationNs: z.number().describe("Mean per-trace duration, in nanoseconds."),
    activeDays: z.number().int().describe("Distinct UTC days with at least one trace."),
  })
  .openapi("UserProfileResponse")

export const UserActivityResponseSchema = z
  .object({
    buckets: z
      .array(
        z
          .object({
            bucket: z.string().describe("ISO-8601 UTC timestamp of the bucket's start."),
            count: z.number().int().describe("Distinct user-attributed sessions starting in the bucket."),
            errorCount: z.number().int().describe("Of `count`, sessions with at least one errored trace."),
          })
          .openapi("UserActivityBucket"),
      )
      .describe("Per-bucket session activity across the range, oldest first."),
    bucketSeconds: z.number().int().describe("Bucket width the buckets were computed with, in seconds."),
    fromIso: z.string().describe("ISO-8601 lower bound of the resolved range."),
    toIso: z.string().describe("ISO-8601 upper bound of the resolved range."),
  })
  .openapi("UserActivityResponse")

export const UserUsageResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            value: z.string().describe("A value of the requested dimension (a model, provider, or tool name)."),
            traceCount: z.number().int().describe("Distinct traces of the user carrying this value."),
          })
          .openapi("UserUsageSlice"),
      )
      .describe("Top dimension values, by distinct trace count, most used first."),
  })
  .openapi("UserUsageResponse")

export const UserSignalsResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            signalId: z.string().describe("Stable identifier of the signal."),
            name: z.string().describe("Human-readable signal name."),
            description: z.string().describe("Signal description."),
            states: z.array(z.string()).describe("Lifecycle states currently applying to the signal."),
            priority: z.string().nullable().describe("Signal priority. `null` when unset."),
            occurrences: z.number().int().describe("Occurrences on the user's traces."),
            affectedTraces: z.number().int().describe("Distinct traces of the user that contributed an occurrence."),
            firstSeenAt: z.string().describe("ISO-8601 timestamp of the first occurrence on the user's traces."),
            lastSeenAt: z.string().describe("ISO-8601 timestamp of the most recent occurrence on the user's traces."),
          })
          .openapi("UserSignal"),
      )
      .describe("Signals seen on the user's traces, most recent occurrence first."),
  })
  .openapi("UserSignalsResponse")

export const UserBehavioursResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            clusterId: z.string().describe("Stable identifier of the behaviour cluster."),
            name: z.string().describe("Human-readable behaviour name."),
            description: z.string().describe("Behaviour description."),
            observationCount: z.number().int().describe("Observations of this behaviour on the user's sessions."),
            firstObservedAt: z.string().describe("ISO-8601 timestamp the behaviour was first observed for the user."),
            lastObservedAt: z.string().describe("ISO-8601 timestamp the behaviour was last observed for the user."),
          })
          .openapi("UserBehaviour"),
      )
      .describe("Behaviour clusters observed on the user's sessions, most frequent first."),
  })
  .openapi("UserBehavioursResponse")

const toProjectUserResponse = (u: ProjectUserSummary) => ({
  userId: u.userId as string,
  userEmail: u.userEmail,
  firstSeenAt: u.firstSeenAt.toISOString(),
  lastSeenAt: u.lastSeenAt.toISOString(),
  traceCount: u.traceCount,
  sessionCount: u.sessionCount,
  errorSessionCount: u.errorSessionCount,
  tokensTotal: u.tokensTotal,
  costTotalMicrocents: u.costTotalMicrocents,
  costAvgMicrocents: u.costAvgMicrocents,
  costMedianMicrocents: u.costMedianMicrocents,
})

const toCostRollupResponse = (rollup: UserCostRollup) => ({
  sum: rollup.sum,
  avg: rollup.avg,
  median: rollup.median,
})

export const toUserListResponse = (page: UserListPage) => ({
  items: page.items.map(toProjectUserResponse),
  totalCount: page.totalCount,
  hasMore: page.hasMore,
  limit: page.limit,
  offset: page.offset,
  costRollup: toCostRollupResponse(page.costRollup),
})

export const toUsersOverviewResponse = (
  overview: UsersOverview,
  range: { from: Date; to: Date; bucketSeconds: number },
) => ({
  uniqueUsers: overview.uniqueUsers,
  newUsers: overview.newUsers,
  identifiedTraces: overview.identifiedTraces,
  totalTraces: overview.totalTraces,
  identifiedSessions: overview.identifiedSessions,
  totalSessions: overview.totalSessions,
  histogram: overview.histogram.map((bucket) => ({
    bucket: bucket.bucket,
    activeUsers: bucket.activeUsers,
    traceCount: bucket.traceCount,
    sessionCount: bucket.sessionCount,
    errorSessionCount: bucket.errorSessionCount,
  })),
  bucketSeconds: range.bucketSeconds,
  fromIso: range.from.toISOString(),
  toIso: range.to.toISOString(),
})

export const toUserProfileResponse = (profile: UserProfile) => ({
  userId: profile.userId as string,
  userEmail: profile.userEmail,
  firstSeenAt: profile.firstSeenAt.toISOString(),
  lastSeenAt: profile.lastSeenAt.toISOString(),
  traceCount: profile.traceCount,
  sessionCount: profile.sessionCount,
  errorSessionCount: profile.errorSessionCount,
  tokensTotal: profile.tokensTotal,
  tokensInput: profile.tokensInput,
  tokensOutput: profile.tokensOutput,
  costTotalMicrocents: profile.costTotalMicrocents,
  avgDurationNs: profile.avgDurationNs,
  activeDays: profile.activeDays,
})

export const toUserActivityResponse = (
  series: readonly UserActivitySeries[],
  scaffold: readonly string[],
  range: { from: Date; to: Date; bucketSeconds: number },
) => {
  const byBucket = new Map((series[0]?.buckets ?? []).map((bucket) => [bucket.bucket, bucket] as const))
  return {
    buckets: scaffold.map((bucket) => ({
      bucket,
      count: byBucket.get(bucket)?.count ?? 0,
      errorCount: byBucket.get(bucket)?.errorCount ?? 0,
    })),
    bucketSeconds: range.bucketSeconds,
    fromIso: range.from.toISOString(),
    toIso: range.to.toISOString(),
  }
}

export const toUserUsageResponse = (slices: readonly UserUsageSlice[]) => ({
  items: slices.map((slice) => ({ value: slice.value, traceCount: slice.traceCount })),
})

export const toUserSignalResponse = (item: UserSignalItem) => ({
  signalId: item.issue.id,
  name: item.issue.name,
  description: item.issue.description,
  states: item.states.map((state) => state as string),
  priority: item.issue.priority,
  occurrences: item.occurrences,
  affectedTraces: item.affectedTraces,
  firstSeenAt: item.firstSeenAt.toISOString(),
  lastSeenAt: item.lastSeenAt.toISOString(),
})

export const toUserBehaviourResponse = (item: UserBehaviourItem) => ({
  clusterId: item.cluster.id,
  name: item.cluster.name,
  description: item.cluster.description,
  observationCount: item.observationCount,
  firstObservedAt: item.firstObservedAt.toISOString(),
  lastObservedAt: item.lastObservedAt.toISOString(),
})
