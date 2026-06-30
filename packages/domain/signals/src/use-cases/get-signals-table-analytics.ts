import { ScoreAnalyticsRepository } from "@domain/scores"
import {
  type ChSqlClient,
  cuidSchema,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  type SignalId,
  type SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { fillBuckets } from "../histogram-buckets.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import type { SignalListAnalytics, SignalPriorityGroup } from "./list-signals-types.ts"
import {
  buildHistogramScaffold,
  buildSessionCountFilters,
  emptyAnalytics,
  emptyPriorityCounts,
  makeZeroWindowMetric,
  matchesAssigneeFilter,
  matchesLifecycleGroup,
  signalsListFiltersSchema,
  sortCandidates,
  toAnalyticsCounts,
  toAssigneeCounts,
  toCandidate,
  toPriorityCounts,
  toScoreAnalyticsTimeRange,
} from "./signals-list-internals.ts"

const getSignalsTableAnalyticsInputSchema = z
  .object({
    organizationId: cuidSchema.transform(OrganizationId),
    projectId: cuidSchema.transform(ProjectId),
    signalIds: z.array(signalIdSchema).optional(),
  })
  .merge(signalsListFiltersSchema)

export type GetSignalsTableAnalyticsInput = z.input<typeof getSignalsTableAnalyticsInputSchema>
export type GetSignalsTableAnalyticsError = RepositoryError

export interface GetSignalsTableAnalyticsResult {
  readonly analytics: SignalListAnalytics
  readonly totalCount: number
  readonly occurrencesSum: number
  readonly priorityCounts: Readonly<Record<SignalPriorityGroup, number>>
  readonly assigneeCounts: Readonly<Record<string, number>>
  readonly hasAnySignals: boolean
}

export const getSignalsTableAnalyticsUseCase = (
  input: GetSignalsTableAnalyticsInput,
): Effect.Effect<
  GetSignalsTableAnalyticsResult,
  GetSignalsTableAnalyticsError,
  ChSqlClient | SignalRepository | ScoreAnalyticsRepository | SessionRepository | SqlClient
> =>
  Effect.gen(function* () {
    const parsed = getSignalsTableAnalyticsInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    const signalRepository = yield* SignalRepository
    const now = parsed.now ?? new Date()
    const selectedTimeRange = toScoreAnalyticsTimeRange(parsed.timeRange)
    const { histogramTimeRange, histogramBucketSeconds, histogramScaffold } = buildHistogramScaffold({
      timeRange: parsed.timeRange,
      now,
    })

    let hasAnySignals = parsed.signalIds !== undefined
    if (!parsed.signalIds) {
      hasAnySignals =
        (yield* signalRepository.list({ projectId: parsed.projectId, limit: 1, offset: 0 })).items.length > 0
    }

    if (!hasAnySignals) {
      return {
        analytics: emptyAnalytics({ histogramScaffold, histogramBucketSeconds }),
        totalCount: 0,
        occurrencesSum: 0,
        priorityCounts: emptyPriorityCounts(),
        assigneeCounts: {},
        hasAnySignals: false,
      } satisfies GetSignalsTableAnalyticsResult
    }

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const sessionRepository = yield* SessionRepository

    const windowMetrics = yield* scoreAnalyticsRepository
      .listSignalWindowMetrics({
        organizationId: parsed.organizationId,
        projectId: parsed.projectId,
        ...(selectedTimeRange ? { timeRange: selectedTimeRange } : {}),
        ...(parsed.signalIds ? { signalIds: parsed.signalIds } : {}),
      })
      .pipe(Effect.withSpan("issues.getSignalsTableAnalytics.listSignalWindowMetrics"))

    const searchCandidates = parsed.search
      ? yield* signalRepository.hybridSearch({
          projectId: parsed.projectId,
          query: parsed.search.query,
          normalizedEmbedding: parsed.search.normalizedEmbedding,
        })
      : []

    const sessionCountFilters = buildSessionCountFilters(parsed.timeRange)
    const sessionCount = yield* sessionRepository
      .countByProjectId({
        organizationId: parsed.organizationId,
        projectId: parsed.projectId,
        ...(sessionCountFilters ? { filters: sessionCountFilters } : {}),
      })
      .pipe(Effect.withSpan("issues.getSignalsTableAnalytics.countByProjectId"))

    const windowMetricsBySignalId = new Map(windowMetrics.map((metric) => [metric.signalId, metric] as const))
    const baseCandidateIds = parsed.search
      ? searchCandidates
          .map((candidate) => candidate.signalId)
          .filter((signalId) => windowMetricsBySignalId.has(signalId))
      : windowMetrics.map((metric) => metric.signalId)
    const candidateSignalIds = parsed.signalIds
      ? Array.from(new Set<SignalId>([...baseCandidateIds, ...parsed.signalIds]))
      : baseCandidateIds

    if (candidateSignalIds.length === 0) {
      return {
        analytics: emptyAnalytics({
          histogramScaffold,
          histogramBucketSeconds,
          totalSessions: sessionCount.totalCount,
        }),
        totalCount: 0,
        occurrencesSum: 0,
        priorityCounts: emptyPriorityCounts(),
        assigneeCounts: {},
        hasAnySignals,
      } satisfies GetSignalsTableAnalyticsResult
    }

    const searchScoresBySignalId = new Map(
      searchCandidates.map((candidate) => [candidate.signalId, candidate.score] as const),
    )
    const forceIncludeSignalIds = parsed.signalIds ? new Set<string>(parsed.signalIds) : null
    const canonicalSignals = yield* signalRepository
      .findByIds({
        projectId: parsed.projectId,
        signalIds: candidateSignalIds,
      })
      .pipe(Effect.withSpan("issues.getSignalsTableAnalytics.findByIds"))

    const matchedSignalIds = canonicalSignals.map((issue) => issue.id)
    const analyticsCandidates = canonicalSignals
      .map((issue) => {
        const windowMetric = windowMetricsBySignalId.get(issue.id) ?? null
        if (!windowMetric && !forceIncludeSignalIds?.has(issue.id)) {
          return null
        }

        return toCandidate({
          issue,
          windowMetric: windowMetric ?? makeZeroWindowMetric(issue),
          similarityScore: searchScoresBySignalId.get(issue.id) ?? null,
          now,
        })
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)

    const analyticsHistogram =
      matchedSignalIds.length > 0
        ? yield* scoreAnalyticsRepository
            .histogramBySignals({
              organizationId: parsed.organizationId,
              projectId: parsed.projectId,
              signalIds: matchedSignalIds,
              timeRange: histogramTimeRange,
              bucketSeconds: histogramBucketSeconds,
            })
            .pipe(Effect.withSpan("issues.getSignalsTableAnalytics.histogramBySignals"))
        : []

    const lifecycleCandidates = analyticsCandidates.filter((candidate) =>
      matchesLifecycleGroup(candidate, parsed.lifecycleGroup),
    )
    const assigneeCounts = toAssigneeCounts(lifecycleCandidates)
    const tableCandidates = sortCandidates(
      lifecycleCandidates.filter((candidate) => matchesAssigneeFilter(candidate, parsed.assigneeIds)),
      {
        field: parsed.sort.field,
        direction: parsed.sort.direction,
        hasSearch: parsed.search !== undefined,
      },
    )
    const priorityCounts = toPriorityCounts(tableCandidates)
    const occurrencesSum = tableCandidates.reduce((sum, candidate) => sum + candidate.windowMetric.occurrences, 0)

    return {
      analytics: {
        counts: toAnalyticsCounts(analyticsCandidates),
        histogram: fillBuckets({
          scaffold: histogramScaffold,
          buckets: analyticsHistogram,
        }),
        histogramBucketSeconds,
        totalSessions: sessionCount.totalCount,
      },
      totalCount: tableCandidates.length,
      occurrencesSum,
      priorityCounts,
      assigneeCounts,
      hasAnySignals,
    } satisfies GetSignalsTableAnalyticsResult
  }).pipe(Effect.withSpan("issues.getSignalsTableAnalytics"))
