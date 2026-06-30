import { ScoreAnalyticsRepository } from "@domain/scores"
import { type ChSqlClient, cuidSchema, OrganizationId, ProjectId, type RepositoryError, SignalId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { getEscalationOccurrenceThreshold } from "../helpers.ts"
import { fillBuckets } from "../histogram-buckets.ts"
import { signalsTimeRangeSchema } from "./list-signals-types.ts"
import {
  buildDailyBucketScaffold,
  buildSessionCountFilters,
  resolveTagsTimeRange,
  resolveTrendTimeRange,
  toScoreAnalyticsTimeRange,
} from "./signals-list-internals.ts"

const getSignalRowMetricsInputSchema = z.object({
  organizationId: cuidSchema.transform(OrganizationId),
  projectId: cuidSchema.transform(ProjectId),
  signalIds: z.array(cuidSchema.transform(SignalId)).min(1).max(100),
  timeRange: signalsTimeRangeSchema.optional(),
  includeTags: z.boolean().default(false),
  now: z.date().optional(),
})

export type GetSignalRowMetricsInput = z.input<typeof getSignalRowMetricsInputSchema>
export type GetSignalRowMetricsError = RepositoryError

export interface SignalRowMetrics {
  readonly occurrences: number
  readonly affectedSessionsPercent: number
  readonly trend: ReadonlyArray<{ readonly bucket: string; readonly count: number }>
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly tags: readonly string[]
  readonly escalationOccurrenceThreshold: number | null
}

export interface GetSignalRowMetricsResult {
  readonly metricsBySignalId: Readonly<Record<string, SignalRowMetrics>>
}

export const getSignalRowMetricsUseCase = (
  input: GetSignalRowMetricsInput,
): Effect.Effect<
  GetSignalRowMetricsResult,
  GetSignalRowMetricsError,
  ChSqlClient | ScoreAnalyticsRepository | SessionRepository
> =>
  Effect.gen(function* () {
    const parsed = getSignalRowMetricsInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    const now = parsed.now ?? new Date()
    const selectedTimeRange = toScoreAnalyticsTimeRange(parsed.timeRange)
    const trendTimeRange = resolveTrendTimeRange({ timeRange: parsed.timeRange, now })
    const trendScaffold = buildDailyBucketScaffold(trendTimeRange)
    const tagsTimeRange = resolveTagsTimeRange({ timeRange: selectedTimeRange, now })

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const sessionRepository = yield* SessionRepository
    const sessionCountFilters = buildSessionCountFilters(parsed.timeRange)

    const [metrics, sessionCount, trendSeries, tagsAggregates, occurrences] = yield* Effect.all([
      scoreAnalyticsRepository.listSignalWindowMetrics({
        organizationId: parsed.organizationId,
        projectId: parsed.projectId,
        signalIds: parsed.signalIds,
        ...(selectedTimeRange ? { timeRange: selectedTimeRange } : {}),
      }),
      sessionRepository.countByProjectId({
        organizationId: parsed.organizationId,
        projectId: parsed.projectId,
        ...(sessionCountFilters ? { filters: sessionCountFilters } : {}),
      }),
      scoreAnalyticsRepository.trendBySignals({
        organizationId: parsed.organizationId,
        projectId: parsed.projectId,
        signalIds: parsed.signalIds,
        timeRange: trendTimeRange,
      }),
      parsed.includeTags
        ? scoreAnalyticsRepository.aggregateTagsBySignals({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            signalIds: parsed.signalIds,
            timeRange: tagsTimeRange,
          })
        : Effect.succeed([]),
      scoreAnalyticsRepository.aggregateBySignals({
        organizationId: parsed.organizationId,
        projectId: parsed.projectId,
        signalIds: parsed.signalIds,
      }),
    ])

    const metricsBySignalId = new Map(metrics.map((metric) => [metric.signalId as string, metric] as const))
    const trendBySignalId = new Map(
      trendSeries.map((series) => [
        series.signalId as string,
        fillBuckets({ scaffold: trendScaffold, buckets: series.buckets }),
      ]),
    )
    const tagsBySignalId = new Map(tagsAggregates.map((entry) => [entry.signalId, entry.tags] as const))
    const occurrencesBySignalId = new Map(occurrences.map((entry) => [entry.signalId, entry] as const))

    return {
      metricsBySignalId: Object.fromEntries(
        parsed.signalIds.map((signalId) => {
          const metric = metricsBySignalId.get(signalId)
          const occurrence = occurrencesBySignalId.get(signalId) ?? null
          return [
            signalId,
            {
              occurrences: metric?.occurrences ?? 0,
              affectedSessionsPercent:
                !metric || sessionCount.totalCount === 0
                  ? 0
                  : Math.min(metric.affectedSessions / sessionCount.totalCount, 1),
              trend:
                trendBySignalId.get(signalId) ??
                fillBuckets({ scaffold: trendScaffold, buckets: [] }).map((bucket) => ({
                  bucket: bucket.bucket,
                  count: bucket.count,
                })),
              firstSeenAt: occurrence?.firstSeenAt ?? metric?.firstSeenAt ?? now,
              lastSeenAt: occurrence?.lastSeenAt ?? metric?.lastSeenAt ?? now,
              tags: tagsBySignalId.get(signalId) ?? [],
              escalationOccurrenceThreshold:
                occurrence !== null ? getEscalationOccurrenceThreshold(occurrence.baselineAvgOccurrences) : null,
            },
          ]
        }),
      ),
    } satisfies GetSignalRowMetricsResult
  }).pipe(Effect.withSpan("issues.getSignalRowMetrics"))
