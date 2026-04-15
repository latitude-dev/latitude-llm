import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import {
  type IssueOccurrenceAggregate,
  type IssueOccurrenceBucket,
  type IssueTrendSeries,
  type IssueWindowMetric,
  ScoreAnalyticsRepository,
  type ScoreAnalyticsTimeRange,
} from "@domain/scores"
import { cuidSchema, OrganizationId, ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { type Issue, IssueState } from "../entities/issue.ts"
import { deriveIssueLifecycleStates, getEscalationOccurrenceThreshold } from "../helpers.ts"
import { type IssueProjectionCandidate, IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

export const issuesLifecycleGroupSchema = z.enum(["active", "archived"])
export type IssuesLifecycleGroup = z.infer<typeof issuesLifecycleGroupSchema>

export const issuesSortFieldSchema = z.enum(["lastSeen", "occurrences"])
export type IssuesSortField = z.infer<typeof issuesSortFieldSchema>

export const issuesSortDirectionSchema = z.enum(["asc", "desc"])
export type IssuesSortDirection = z.infer<typeof issuesSortDirectionSchema>

export const issuesTimeRangeSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
})

export const issueSearchSchema = z.object({
  query: z.string().min(1),
  normalizedEmbedding: z.array(z.number()),
})

const listIssuesInputSchema = z.object({
  organizationId: cuidSchema.transform(OrganizationId),
  projectId: cuidSchema.transform(ProjectId),
  lifecycleGroup: issuesLifecycleGroupSchema.optional(),
  search: issueSearchSchema.optional(),
  timeRange: issuesTimeRangeSchema.optional(),
  sort: z
    .object({
      field: issuesSortFieldSchema.default("lastSeen"),
      direction: issuesSortDirectionSchema.default("desc"),
    })
    .default({
      field: "lastSeen",
      direction: "desc",
    }),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  now: z.date().optional(),
})

export type ListIssuesInput = z.input<typeof listIssuesInputSchema>
export type ListIssuesError = RepositoryError

export interface IssueListAnalyticsCounts {
  readonly newIssues: number
  readonly escalatingIssues: number
  readonly regressedIssues: number
  readonly resolvedIssues: number
  readonly seenOccurrences: number
}

export interface IssueListAnalytics {
  readonly counts: IssueListAnalyticsCounts
  readonly histogram: readonly IssueOccurrenceBucket[]
  readonly totalTraces: number
}

export interface IssueListItem {
  readonly id: string
  readonly uuid: string
  readonly projectId: string
  readonly name: string
  readonly description: string
  readonly states: readonly string[]
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly escalatedAt: Date | null
  readonly resolvedAt: Date | null
  readonly ignoredAt: Date | null
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly occurrences: number
  readonly similarityScore: number | null
  readonly affectedTracesPercent: number
  readonly escalationOccurrenceThreshold: number | null
  readonly trend: readonly IssueOccurrenceBucket[]
  readonly evaluations: readonly Evaluation[]
}

export interface ListIssuesResult {
  readonly analytics: IssueListAnalytics
  readonly items: readonly IssueListItem[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
  readonly occurrencesSum: number
}

interface AnalyticsCandidate {
  readonly issue: Issue
  readonly windowMetric: IssueWindowMetric
  readonly lifecycleStates: readonly string[]
  readonly similarityScore: number | null
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly escalationOccurrenceThreshold: number | null
}

const toUtcDayStart = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0))

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

const resolveHistogramTimeRange = (input: {
  readonly timeRange: z.infer<typeof issuesTimeRangeSchema> | undefined
  readonly now: Date
}): { readonly from: Date; readonly to: Date } => {
  if (input.timeRange?.from && input.timeRange?.to) {
    return {
      from: toUtcDayStart(input.timeRange.from),
      to: toUtcDayEnd(input.timeRange.to),
    }
  }

  if (input.timeRange?.from) {
    return {
      from: toUtcDayStart(input.timeRange.from),
      to: toUtcDayEnd(input.now),
    }
  }

  const end = toUtcDayEnd(input.timeRange?.to ?? input.now)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  start.setUTCHours(0, 0, 0, 0)

  return {
    from: start,
    to: end,
  }
}

const resolveTrendTimeRange = (input: {
  readonly timeRange: z.infer<typeof issuesTimeRangeSchema> | undefined
  readonly now: Date
}): { readonly from: Date; readonly to: Date } => {
  const end = toUtcDayEnd(input.timeRange?.to ?? input.timeRange?.from ?? input.now)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 13)
  start.setUTCHours(0, 0, 0, 0)

  return {
    from: start,
    to: end,
  }
}

const toScoreAnalyticsTimeRange = (
  timeRange: z.infer<typeof issuesTimeRangeSchema> | undefined,
): ScoreAnalyticsTimeRange | undefined => {
  const normalized: {
    from?: Date
    to?: Date
  } = {}

  if (timeRange?.from !== undefined) {
    normalized.from = timeRange.from
  }

  if (timeRange?.to !== undefined) {
    normalized.to = timeRange.to
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

const buildBucketScaffold = (input: { readonly from: Date; readonly to: Date }): readonly string[] => {
  const buckets: string[] = []
  const cursor = new Date(input.from)
  cursor.setUTCHours(0, 0, 0, 0)

  while (cursor.getTime() <= input.to.getTime()) {
    buckets.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return buckets
}

const fillBuckets = (input: {
  readonly scaffold: readonly string[]
  readonly buckets: readonly IssueOccurrenceBucket[]
}): readonly IssueOccurrenceBucket[] => {
  const countsByBucket = new Map(input.buckets.map((bucket) => [bucket.bucket, bucket.count] as const))

  return input.scaffold.map((bucket) => ({
    bucket,
    count: countsByBucket.get(bucket) ?? 0,
  }))
}

const matchesLifecycleGroup = (
  candidate: AnalyticsCandidate,
  lifecycleGroup: IssuesLifecycleGroup | undefined,
): boolean => {
  if (lifecycleGroup === undefined) {
    return true
  }

  const isArchived = candidate.issue.ignoredAt !== null || candidate.lifecycleStates.includes(IssueState.Resolved)
  return lifecycleGroup === "archived" ? isArchived : !isArchived
}

const compareDesc = (left: number, right: number): number => right - left
const compareAsc = (left: number, right: number): number => left - right

const sortCandidates = (
  candidates: readonly AnalyticsCandidate[],
  input: {
    readonly field: IssuesSortField
    readonly direction: IssuesSortDirection
    readonly hasSearch: boolean
  },
): readonly AnalyticsCandidate[] =>
  [...candidates].sort((left, right) => {
    if (input.field === "occurrences") {
      const occurrencesComparison =
        input.direction === "asc"
          ? compareAsc(left.windowMetric.occurrences, right.windowMetric.occurrences)
          : compareDesc(left.windowMetric.occurrences, right.windowMetric.occurrences)
      if (occurrencesComparison !== 0) {
        return occurrencesComparison
      }
    } else {
      const lastSeenComparison =
        input.direction === "asc"
          ? compareAsc(left.lastSeenAt.getTime(), right.lastSeenAt.getTime())
          : compareDesc(left.lastSeenAt.getTime(), right.lastSeenAt.getTime())
      if (lastSeenComparison !== 0) {
        return lastSeenComparison
      }

      const occurrencesComparison = compareDesc(left.windowMetric.occurrences, right.windowMetric.occurrences)
      if (occurrencesComparison !== 0) {
        return occurrencesComparison
      }
    }

    const lastSeenComparison = compareDesc(left.lastSeenAt.getTime(), right.lastSeenAt.getTime())
    if (lastSeenComparison !== 0) {
      return lastSeenComparison
    }

    if (input.hasSearch) {
      const similarityComparison = compareDesc(left.similarityScore ?? 0, right.similarityScore ?? 0)
      if (similarityComparison !== 0) {
        return similarityComparison
      }
    }

    return left.issue.id.localeCompare(right.issue.id)
  })

const toCandidate = (input: {
  readonly issue: Issue
  readonly windowMetric: IssueWindowMetric
  readonly occurrence: IssueOccurrenceAggregate | null
  readonly similarityScore: number | null
  readonly now: Date
}): AnalyticsCandidate => {
  const lifecycleStates = deriveIssueLifecycleStates({
    issue: input.issue,
    occurrence: input.occurrence,
    now: input.now,
  })

  return {
    issue: input.issue,
    windowMetric: input.windowMetric,
    lifecycleStates,
    similarityScore: input.similarityScore,
    firstSeenAt: input.occurrence?.firstSeenAt ?? input.windowMetric.firstSeenAt ?? input.issue.createdAt,
    lastSeenAt: input.occurrence?.lastSeenAt ?? input.windowMetric.lastSeenAt ?? input.issue.createdAt,
    escalationOccurrenceThreshold:
      input.occurrence !== null ? getEscalationOccurrenceThreshold(input.occurrence.baselineAvgOccurrences) : null,
  }
}

const toAnalyticsCounts = (candidates: readonly AnalyticsCandidate[]): IssueListAnalyticsCounts => ({
  newIssues: candidates.filter((candidate) => candidate.lifecycleStates.includes(IssueState.New)).length,
  escalatingIssues: candidates.filter((candidate) => candidate.lifecycleStates.includes(IssueState.Escalating)).length,
  regressedIssues: candidates.filter((candidate) => candidate.lifecycleStates.includes(IssueState.Regressed)).length,
  resolvedIssues: candidates.filter((candidate) => candidate.lifecycleStates.includes(IssueState.Resolved)).length,
  seenOccurrences: candidates.reduce((sum, candidate) => sum + candidate.windowMetric.occurrences, 0),
})

export const listIssuesUseCase = (
  input: ListIssuesInput,
): Effect.Effect<
  ListIssuesResult,
  ListIssuesError,
  EvaluationRepository | IssueProjectionRepository | IssueRepository | ScoreAnalyticsRepository
> =>
  Effect.gen(function* () {
    const parsed = listIssuesInputSchema.parse(input)
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const issueRepository = yield* IssueRepository
    const evaluationRepository = yield* EvaluationRepository
    const issueProjectionRepository = yield* IssueProjectionRepository
    const now = parsed.now ?? new Date()
    const selectedTimeRange = toScoreAnalyticsTimeRange(parsed.timeRange)

    const windowMetricsEffect = scoreAnalyticsRepository.listIssueWindowMetrics({
      organizationId: parsed.organizationId,
      projectId: parsed.projectId,
      ...(selectedTimeRange ? { timeRange: selectedTimeRange } : {}),
    })

    const searchCandidatesEffect = parsed.search
      ? issueProjectionRepository.hybridSearch({
          projectId: parsed.projectId,
          query: parsed.search.query,
          vector: parsed.search.normalizedEmbedding,
        })
      : Effect.succeed([] satisfies readonly IssueProjectionCandidate[])

    const [windowMetrics, searchCandidates, totalTraces] = yield* Effect.all([
      windowMetricsEffect,
      searchCandidatesEffect,
      scoreAnalyticsRepository.countDistinctTracesByTimeRange({
        organizationId: parsed.organizationId,
        projectId: parsed.projectId,
        ...(selectedTimeRange ? { timeRange: selectedTimeRange } : {}),
      }),
    ])

    const candidateIssueIds = windowMetrics.map((metric) => metric.issueId)
    const histogramTimeRange = resolveHistogramTimeRange({
      timeRange: parsed.timeRange,
      now,
    })
    const histogramScaffold = buildBucketScaffold(histogramTimeRange)

    if (candidateIssueIds.length === 0) {
      return {
        analytics: {
          counts: {
            newIssues: 0,
            escalatingIssues: 0,
            regressedIssues: 0,
            resolvedIssues: 0,
            seenOccurrences: 0,
          },
          histogram: fillBuckets({ scaffold: histogramScaffold, buckets: [] }),
          totalTraces,
        },
        items: [],
        totalCount: 0,
        hasMore: false,
        limit: parsed.limit,
        offset: parsed.offset,
        occurrencesSum: 0,
      } satisfies ListIssuesResult
    }

    const searchScoresByUuid = new Map(searchCandidates.map((candidate) => [candidate.uuid, candidate.score] as const))
    const windowMetricsByIssueId = new Map(windowMetrics.map((metric) => [metric.issueId, metric] as const))
    const canonicalIssues = yield* issueRepository.findByIds({
      projectId: parsed.projectId,
      issueIds: candidateIssueIds,
    })

    const searchMatchedIssues =
      parsed.search === undefined
        ? canonicalIssues
        : canonicalIssues.filter((issue) => searchScoresByUuid.has(issue.uuid))

    const matchedIssueIds = searchMatchedIssues.map((issue) => issue.id)
    const fullHistoryOccurrences =
      matchedIssueIds.length === 0
        ? []
        : yield* scoreAnalyticsRepository.aggregateByIssues({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            issueIds: matchedIssueIds,
          })
    const occurrencesByIssueId = new Map(
      fullHistoryOccurrences.map((occurrence) => [occurrence.issueId, occurrence] as const),
    )

    const analyticsCandidates = searchMatchedIssues
      .map((issue) => {
        const windowMetric = windowMetricsByIssueId.get(issue.id)
        if (!windowMetric) {
          return null
        }

        return toCandidate({
          issue,
          windowMetric,
          occurrence: occurrencesByIssueId.get(issue.id) ?? null,
          similarityScore: searchScoresByUuid.get(issue.uuid) ?? null,
          now,
        })
      })
      .filter((candidate): candidate is AnalyticsCandidate => candidate !== null)

    const analyticsHistogram =
      matchedIssueIds.length === 0
        ? []
        : yield* scoreAnalyticsRepository.histogramByIssues({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            issueIds: matchedIssueIds,
            timeRange: histogramTimeRange,
          })

    const tableCandidates = sortCandidates(
      analyticsCandidates.filter((candidate) => matchesLifecycleGroup(candidate, parsed.lifecycleGroup)),
      {
        field: parsed.sort.field,
        direction: parsed.sort.direction,
        hasSearch: parsed.search !== undefined,
      },
    )
    const occurrencesSum = tableCandidates.reduce((sum, candidate) => sum + candidate.windowMetric.occurrences, 0)
    const pageCandidates = tableCandidates.slice(parsed.offset, parsed.offset + parsed.limit)
    const pageIssueIds = pageCandidates.map((candidate) => candidate.issue.id)
    const trendTimeRange = resolveTrendTimeRange({
      timeRange: parsed.timeRange,
      now,
    })
    const trendScaffold = buildBucketScaffold(trendTimeRange)

    const [evaluationPage, trendSeries] = yield* Effect.all([
      pageIssueIds.length === 0
        ? Effect.succeed({
            items: [] as readonly Evaluation[],
            hasMore: false,
            limit: 0,
            offset: 0,
          })
        : evaluationRepository.listByIssueIds({
            projectId: parsed.projectId,
            issueIds: pageIssueIds,
            options: {
              lifecycle: "active",
              limit: 1000,
            },
          }),
      pageIssueIds.length === 0
        ? Effect.succeed([] satisfies readonly IssueTrendSeries[])
        : scoreAnalyticsRepository.trendByIssues({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            issueIds: pageIssueIds,
            timeRange: trendTimeRange,
          }),
    ])

    const evaluationsByIssueId = new Map<string, Evaluation[]>()
    for (const evaluation of evaluationPage.items) {
      const evaluations = evaluationsByIssueId.get(evaluation.issueId) ?? []
      evaluations.push(evaluation)
      evaluationsByIssueId.set(evaluation.issueId, evaluations)
    }

    const trendByIssueId = new Map(
      trendSeries.map((series) => [
        series.issueId,
        fillBuckets({
          scaffold: trendScaffold,
          buckets: series.buckets,
        }),
      ]),
    )

    return {
      analytics: {
        counts: toAnalyticsCounts(analyticsCandidates),
        histogram: fillBuckets({
          scaffold: histogramScaffold,
          buckets: analyticsHistogram,
        }),
        totalTraces,
      },
      items: pageCandidates.map((candidate) => ({
        id: candidate.issue.id,
        uuid: candidate.issue.uuid,
        projectId: candidate.issue.projectId,
        name: candidate.issue.name,
        description: candidate.issue.description,
        states: candidate.lifecycleStates,
        createdAt: candidate.issue.createdAt,
        updatedAt: candidate.issue.updatedAt,
        escalatedAt: candidate.issue.escalatedAt,
        resolvedAt: candidate.issue.resolvedAt,
        ignoredAt: candidate.issue.ignoredAt,
        firstSeenAt: candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt,
        occurrences: candidate.windowMetric.occurrences,
        similarityScore: candidate.similarityScore,
        affectedTracesPercent: totalTraces === 0 ? 0 : Math.min(candidate.windowMetric.occurrences / totalTraces, 1),
        escalationOccurrenceThreshold: candidate.escalationOccurrenceThreshold,
        trend: trendByIssueId.get(candidate.issue.id) ?? fillBuckets({ scaffold: trendScaffold, buckets: [] }),
        evaluations: evaluationsByIssueId.get(candidate.issue.id) ?? [],
      })),
      totalCount: tableCandidates.length,
      hasMore: parsed.offset + parsed.limit < tableCandidates.length,
      limit: parsed.limit,
      offset: parsed.offset,
      occurrencesSum,
    } satisfies ListIssuesResult
  })
