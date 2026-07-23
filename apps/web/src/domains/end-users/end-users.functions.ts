import { ExternalUserId, ProjectId } from "@domain/shared"
import { buildHistogramBucketScaffold, fillBuckets, listUserSignalsUseCase } from "@domain/signals"
import type { ProjectUserSummary, UserProfile, UsersOverview, UserUsageSlice } from "@domain/spans"
import { USER_SORT_FIELDS, UserAnalyticsRepository } from "@domain/spans"
import { listUserBehavioursUseCase, type UserBehaviourItem } from "@domain/taxonomy"
import {
  ScoreAnalyticsRepositoryLive,
  TaxonomyObservationRepositoryLive,
  UserAnalyticsRepositoryLive,
} from "@platform/db-clickhouse"
import { SignalRepositoryLive, TaxonomyClusterRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

const DAY_SECONDS = 24 * 60 * 60
const HOUR_SECONDS = 60 * 60
const DEFAULT_OVERVIEW_DAYS = 30

const timeRangeSchema = z.object({
  fromIso: z.iso.datetime().optional(),
  toIso: z.iso.datetime().optional(),
})

const listProjectUsersInputSchema = z.object({
  projectId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z
    .object({
      field: z.enum(USER_SORT_FIELDS),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
  searchQuery: z.string().max(500).optional(),
  timeRange: timeRangeSchema.optional(),
  /** Per-row sparkline bucket width; defaults to a density-based heuristic. */
  trendBucketSeconds: z
    .number()
    .int()
    .min(HOUR_SECONDS)
    .max(31 * DAY_SECONDS)
    .optional(),
})

/** Hourly buckets for ranges up to ~2 days, daily above — keeps charts at a readable density. */
const bucketSecondsFor = (from: Date, to: Date): number =>
  to.getTime() - from.getTime() <= 49 * HOUR_SECONDS * 1000 ? HOUR_SECONDS : DAY_SECONDS

const resolveRange = (
  timeRange: { fromIso?: string | undefined; toIso?: string | undefined } | undefined,
  defaultDays: number,
) => {
  const to = timeRange?.toIso ? new Date(timeRange.toIso) : new Date()
  const from = timeRange?.fromIso
    ? new Date(timeRange.fromIso)
    : new Date(to.getTime() - defaultDays * DAY_SECONDS * 1000)
  return { from, to }
}

const toProjectUserRecord = (
  user: ProjectUserSummary,
  activity: readonly { readonly bucket: string; readonly count: number }[],
) => ({
  userId: user.userId as string,
  userEmail: user.userEmail,
  firstSeenAt: user.firstSeenAt.toISOString(),
  lastSeenAt: user.lastSeenAt.toISOString(),
  traceCount: user.traceCount,
  sessionCount: user.sessionCount,
  errorSessionCount: user.errorSessionCount,
  tokensTotal: user.tokensTotal,
  costTotalMicrocents: user.costTotalMicrocents,
  costAvgMicrocents: user.costAvgMicrocents,
  costMedianMicrocents: user.costMedianMicrocents,
  activity,
})

export type ProjectUserRecord = ReturnType<typeof toProjectUserRecord>

export interface ProjectUsersPageRecord {
  readonly items: readonly ProjectUserRecord[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
  /** Bucket width the `activity` sparklines were computed with. */
  readonly activityBucketSeconds: number
  /** Cost aggregates across every matching user — one value per cost column mode. */
  readonly costRollup: { readonly sum: number; readonly avg: number; readonly median: number }
}

export const listProjectUsers = createServerFn({ method: "GET" })
  .inputValidator(listProjectUsersInputSchema)
  .handler(async ({ data, context }): Promise<ProjectUsersPageRecord> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const trimmedSearchQuery = data.searchQuery?.trim() || undefined
    // The list metrics, the membership window, and the per-row sparkline all
    // share one resolved range (last 30 days when no filter), like the tools
    // section.
    const { from, to } = resolveRange(data.timeRange, DEFAULT_OVERVIEW_DAYS)
    const bucketSeconds = data.trendBucketSeconds ?? bucketSecondsFor(from, to)
    const scaffold = buildHistogramBucketScaffold({ from, to, bucketSeconds })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const userAnalyticsRepository = yield* UserAnalyticsRepository

        const page = yield* userAnalyticsRepository.listByProjectId({
          organizationId: orgId,
          projectId,
          options: {
            ...(data.limit !== undefined ? { limit: data.limit } : {}),
            ...(data.offset !== undefined ? { offset: data.offset } : {}),
            ...(data.sort ? { sortBy: data.sort.field, sortDirection: data.sort.direction } : {}),
            ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
            timeRange: { from, to },
          },
        })

        const activitySeries =
          page.items.length > 0
            ? yield* userAnalyticsRepository.activityByUserIds({
                organizationId: orgId,
                projectId,
                userIds: page.items.map((user) => user.userId),
                timeRange: { from, to },
                bucketSeconds,
              })
            : []

        return { page, activitySeries }
      }).pipe(withScopedClickHouse(UserAnalyticsRepositoryLive, chClient, orgId), withTracing),
    )

    const activityByUserId = new Map(result.activitySeries.map((series) => [series.userId, series.buckets] as const))
    return {
      items: result.page.items.map((user) =>
        toProjectUserRecord(user, fillBuckets({ scaffold, buckets: activityByUserId.get(user.userId) ?? [] })),
      ),
      totalCount: result.page.totalCount,
      hasMore: result.page.hasMore,
      limit: result.page.limit,
      offset: result.page.offset,
      activityBucketSeconds: bucketSeconds,
      costRollup: result.page.costRollup,
    }
  })

const usersOverviewInputSchema = z.object({
  projectId: z.string(),
  timeRange: timeRangeSchema.optional(),
})

const toUsersOverviewRecord = (overview: UsersOverview, input: { from: Date; to: Date; bucketSeconds: number }) => ({
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
  bucketSeconds: input.bucketSeconds,
  fromIso: input.from.toISOString(),
  toIso: input.to.toISOString(),
})

export type UsersOverviewRecord = ReturnType<typeof toUsersOverviewRecord>

export const getUsersOverview = createServerFn({ method: "GET" })
  .inputValidator(usersOverviewInputSchema)
  .handler(async ({ data, context }): Promise<UsersOverviewRecord> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const { from, to } = resolveRange(data.timeRange, DEFAULT_OVERVIEW_DAYS)
    const bucketSeconds = bucketSecondsFor(from, to)

    const overview = await Effect.runPromise(
      Effect.gen(function* () {
        const userAnalyticsRepository = yield* UserAnalyticsRepository
        return yield* userAnalyticsRepository.getOverviewByProjectId({
          organizationId: orgId,
          projectId,
          timeRange: { from, to },
          bucketSeconds,
        })
      }).pipe(withScopedClickHouse(UserAnalyticsRepositoryLive, chClient, orgId), withTracing),
    )

    return toUsersOverviewRecord(overview, { from, to, bucketSeconds })
  })

const userInputSchema = z.object({
  projectId: z.string(),
  userId: z.string().min(1).max(512),
})

const userProfileInputSchema = userInputSchema.extend({
  errorsOnly: z.boolean().optional(),
})

const toUserProfileRecord = (profile: UserProfile) => ({
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

export type UserProfileRecord = ReturnType<typeof toUserProfileRecord>

export const getUserProfile = createServerFn({ method: "GET" })
  .inputValidator(userProfileInputSchema)
  .handler(async ({ data, context }): Promise<UserProfileRecord | null> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()

    const profile = await Effect.runPromise(
      Effect.gen(function* () {
        const userAnalyticsRepository = yield* UserAnalyticsRepository
        return yield* userAnalyticsRepository
          .findByUserId({
            organizationId: orgId,
            projectId: ProjectId(data.projectId),
            userId: ExternalUserId(data.userId),
            ...(data.errorsOnly ? { errorsOnly: true } : {}),
          })
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      }).pipe(withScopedClickHouse(UserAnalyticsRepositoryLive, chClient, orgId), withTracing),
    )

    return profile ? toUserProfileRecord(profile) : null
  })

const userActivityInputSchema = z.object({
  projectId: z.string(),
  userId: z.string().min(1).max(512),
  timeRange: timeRangeSchema.optional(),
  errorsOnly: z.boolean().optional(),
})

export interface UserActivityRecord {
  readonly buckets: readonly { readonly bucket: string; readonly count: number; readonly errorCount: number }[]
  readonly bucketSeconds: number
  readonly fromIso: string
  readonly toIso: string
}

export const getUserActivity = createServerFn({ method: "GET" })
  .inputValidator(userActivityInputSchema)
  .handler(async ({ data, context }): Promise<UserActivityRecord> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()
    const { from, to } = resolveRange(data.timeRange, DEFAULT_OVERVIEW_DAYS)
    const bucketSeconds = bucketSecondsFor(from, to)
    const scaffold = buildHistogramBucketScaffold({ from, to, bucketSeconds })

    const series = await Effect.runPromise(
      Effect.gen(function* () {
        const userAnalyticsRepository = yield* UserAnalyticsRepository
        return yield* userAnalyticsRepository.activityByUserIds({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          userIds: [ExternalUserId(data.userId)],
          timeRange: { from, to },
          bucketSeconds,
          ...(data.errorsOnly ? { errorsOnly: true } : {}),
        })
      }).pipe(withScopedClickHouse(UserAnalyticsRepositoryLive, chClient, orgId), withTracing),
    )

    const byBucket = new Map((series[0]?.buckets ?? []).map((bucket) => [bucket.bucket, bucket] as const))

    return {
      buckets: scaffold.map((bucket) => ({
        bucket,
        count: byBucket.get(bucket)?.count ?? 0,
        errorCount: byBucket.get(bucket)?.errorCount ?? 0,
      })),
      bucketSeconds,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    }
  })

const userUsageInputSchema = z.object({
  projectId: z.string(),
  userId: z.string().min(1).max(512),
  dimension: z.enum(["model", "provider", "tool"]),
  limit: z.number().int().min(1).max(50).optional(),
  errorsOnly: z.boolean().optional(),
})

export interface UserUsageSliceRecord {
  readonly value: string
  readonly traceCount: number
}

export const getUserUsage = createServerFn({ method: "GET" })
  .inputValidator(userUsageInputSchema)
  .handler(async ({ data, context }): Promise<readonly UserUsageSliceRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()

    const slices = await Effect.runPromise(
      Effect.gen(function* () {
        const userAnalyticsRepository = yield* UserAnalyticsRepository
        return yield* userAnalyticsRepository.usageBreakdownByUserId({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          userId: ExternalUserId(data.userId),
          dimension: data.dimension,
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
          ...(data.errorsOnly ? { errorsOnly: true } : {}),
        })
      }).pipe(withScopedClickHouse(UserAnalyticsRepositoryLive, chClient, orgId), withTracing),
    )

    return slices.map((slice: UserUsageSlice) => ({ value: slice.value, traceCount: slice.traceCount }))
  })

export interface UserSignalRecord {
  readonly signalId: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly states: readonly string[]
  readonly priority: string | null
  readonly occurrences: number
  readonly affectedTraces: number
  readonly firstSeenAt: string
  readonly lastSeenAt: string
}

export const listUserSignals = createServerFn({ method: "GET" })
  .inputValidator(userInputSchema)
  .handler(async ({ data, context }): Promise<readonly UserSignalRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()

    const items = await Effect.runPromise(
      listUserSignalsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        userId: ExternalUserId(data.userId),
      }).pipe(
        withScopedPostgres(SignalRepositoryLive, pgClient, orgId),
        withScopedClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId),
        withTracing,
      ),
    )

    return items.map(
      (item): UserSignalRecord => ({
        signalId: item.issue.id,
        slug: item.issue.slug,
        name: item.issue.name,
        description: item.issue.description,
        states: item.states,
        priority: item.issue.priority,
        occurrences: item.occurrences,
        affectedTraces: item.affectedTraces,
        firstSeenAt: item.firstSeenAt.toISOString(),
        lastSeenAt: item.lastSeenAt.toISOString(),
      }),
    )
  })

export interface UserBehaviourRecord {
  readonly clusterId: string
  readonly name: string
  readonly description: string
  readonly observationCount: number
  readonly firstObservedAt: string
  readonly lastObservedAt: string
}

export const listUserBehaviours = createServerFn({ method: "GET" })
  .inputValidator(userInputSchema)
  .handler(async ({ data, context }): Promise<readonly UserBehaviourRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()

    const items = await Effect.runPromise(
      listUserBehavioursUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        userId: ExternalUserId(data.userId),
      }).pipe(
        withScopedPostgres(TaxonomyClusterRepositoryLive, pgClient, orgId),
        withScopedClickHouse(TaxonomyObservationRepositoryLive, chClient, orgId),
        withTracing,
      ),
    )

    return items.map(
      (item: UserBehaviourItem): UserBehaviourRecord => ({
        clusterId: item.cluster.id,
        name: item.cluster.name,
        description: item.cluster.description,
        observationCount: item.observationCount,
        firstObservedAt: item.firstObservedAt.toISOString(),
        lastObservedAt: item.lastObservedAt.toISOString(),
      }),
    )
  })
