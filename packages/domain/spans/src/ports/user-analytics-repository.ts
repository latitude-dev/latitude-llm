import type {
  ChSqlClient,
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
} from "@domain/shared"
import { Context, type Effect } from "effect"

/** One end-user of the customer's app, aggregated from the traces that carry their `user_id`. */
export interface ProjectUserSummary {
  readonly userId: ExternalUserId
  /** Latest non-empty email seen on the user's traces ('' when never reported). */
  readonly userEmail: string
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly traceCount: number
  readonly sessionCount: number
  /** Sessions with at least one errored trace. */
  readonly errorSessionCount: number
  readonly tokensTotal: number
  readonly costTotalMicrocents: number
  /** Mean per-trace cost across the user's traces. */
  readonly costAvgMicrocents: number
  /** Median (p50) per-trace cost across the user's traces. */
  readonly costMedianMicrocents: number
}

export const USER_SORT_FIELDS = [
  "lastSeen",
  "firstSeen",
  "traces",
  "sessions",
  "errors",
  "tokens",
  "cost",
  "costAvg",
  "costMedian",
] as const

export type UserSortField = (typeof USER_SORT_FIELDS)[number]

export const isUserSortField = (value: string): value is UserSortField =>
  (USER_SORT_FIELDS as readonly string[]).includes(value)

export interface UserListTimeRange {
  readonly from?: Date
  readonly to?: Date
}

export interface UserListOptions {
  readonly limit?: number
  readonly offset?: number
  readonly sortBy?: UserSortField
  readonly sortDirection?: "asc" | "desc"
  /** Case-insensitive substring match on `user_id` or `user_email`. */
  readonly searchQuery?: string
  /** Bounds on trace `start_time`; users outside the range are excluded and metrics are range-scoped. */
  readonly timeRange?: UserListTimeRange
}

/**
 * Column-level cost aggregates across every matching user (not just the page):
 * sum of per-user totals, mean of per-user averages, median of per-user medians
 * — one value per display mode of the cost column.
 */
export interface UserCostRollup {
  readonly sum: number
  readonly avg: number
  readonly median: number
}

export interface UserListPage {
  readonly items: readonly ProjectUserSummary[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
  readonly costRollup: UserCostRollup
}

/** Bucket key is an ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:MM:SS.000Z`). */
export interface UserActivityBucket {
  readonly bucket: string
  readonly count: number
}

export interface UserActivitySeries {
  readonly userId: ExternalUserId
  readonly buckets: readonly UserActivityBucket[]
}

export interface UsersOverviewBucket {
  readonly bucket: string
  readonly activeUsers: number
  readonly traceCount: number
}

export interface UsersOverview {
  /** Distinct identified users with at least one trace in range. */
  readonly uniqueUsers: number
  /** Users whose first trace ever falls inside the range. */
  readonly newUsers: number
  /** Traces in range carrying a non-empty `user_id`. */
  readonly identifiedTraces: number
  /** All traces in range, identified or not. */
  readonly totalTraces: number
  readonly histogram: readonly UsersOverviewBucket[]
}

/** Lifetime profile rollup for one end-user (no time-range bound). */
export interface UserProfile extends ProjectUserSummary {
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly avgDurationNs: number
  /** Distinct UTC days with at least one trace. */
  readonly activeDays: number
}

export type UserUsageDimension = "model" | "provider" | "tool"

/** One value of a usage dimension and the distinct traces of the user carrying it. */
export interface UserUsageSlice {
  readonly value: string
  readonly traceCount: number
}

export interface UserAnalyticsRepositoryShape {
  listByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options?: UserListOptions
  }): Effect.Effect<UserListPage, RepositoryError, ChSqlClient>

  /** Per-user trace counts bucketed by `bucketSeconds`, batched for one page of users. */
  activityByUserIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly userIds: readonly ExternalUserId[]
    readonly timeRange: { readonly from: Date; readonly to: Date }
    readonly bucketSeconds: number
  }): Effect.Effect<readonly UserActivitySeries[], RepositoryError, ChSqlClient>

  getOverviewByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly timeRange: { readonly from: Date; readonly to: Date }
    readonly bucketSeconds: number
  }): Effect.Effect<UsersOverview, RepositoryError, ChSqlClient>

  findByUserId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly userId: ExternalUserId
  }): Effect.Effect<UserProfile, NotFoundError | RepositoryError, ChSqlClient>

  /** Top values of one usage dimension across the user's traces, by distinct trace count. */
  usageBreakdownByUserId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly userId: ExternalUserId
    readonly dimension: UserUsageDimension
    readonly limit?: number
  }): Effect.Effect<readonly UserUsageSlice[], RepositoryError, ChSqlClient>
}

export class UserAnalyticsRepository extends Context.Service<UserAnalyticsRepository, UserAnalyticsRepositoryShape>()(
  "@domain/spans/UserAnalyticsRepository",
) {}
