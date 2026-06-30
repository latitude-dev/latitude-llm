import type {
  ScoreAnalyticsTimeRange,
  SignalOccurrenceBucket,
  SignalTagsTimeRange,
  SignalWindowMetric,
} from "@domain/scores"
import type { FilterCondition, FilterSet } from "@domain/shared"
import { pickTraceHistogramBucketSeconds } from "@domain/spans"
import { z } from "zod"
import { SIGNAL_PRIORITY_GROUPS, SIGNAL_PRIORITY_ORDER } from "../constants.ts"
import { type SignalPriority, SignalState } from "../entities/signal.ts"
import { deriveSignalLifecycleStates } from "../helpers.ts"
import { buildHistogramBucketScaffold, fillBuckets } from "../histogram-buckets.ts"
import type { SignalWithLifecycle } from "../ports/signal-repository.ts"
import {
  type SignalAssigneeFilter,
  type SignalListAnalyticsCounts,
  type SignalListItem,
  type SignalPriorityGroup,
  type SignalsLifecycleGroup,
  type SignalsSortDirection,
  type SignalsSortField,
  signalAssigneeFilterSchema,
  signalSearchSchema,
  signalsLifecycleGroupSchema,
  signalsSortDirectionSchema,
  signalsSortFieldSchema,
  signalsTimeRangeSchema,
  UNASSIGNED_FILTER,
} from "./list-signals-types.ts"

export interface AnalyticsCandidate {
  readonly issue: SignalWithLifecycle
  readonly windowMetric: SignalWindowMetric
  readonly lifecycleStates: readonly string[]
  readonly similarityScore: number | null
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly escalationOccurrenceThreshold: number | null
}

export const signalsListFiltersSchema = z.object({
  lifecycleGroup: signalsLifecycleGroupSchema.optional(),
  assigneeIds: z.array(signalAssigneeFilterSchema).min(1).optional(),
  search: signalSearchSchema.optional(),
  textSearchQuery: z.string().min(1).optional(),
  timeRange: signalsTimeRangeSchema.optional(),
  sort: z
    .object({
      field: signalsSortFieldSchema.default("lastSeen"),
      direction: signalsSortDirectionSchema.default("desc"),
    })
    .default({
      field: "lastSeen",
      direction: "desc",
    }),
  now: z.date().optional(),
})

const toUtcDayStart = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0))

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

const resolveHistogramTimeRange = (input: {
  readonly timeRange: z.infer<typeof signalsTimeRangeSchema> | undefined
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

export const resolveTrendTimeRange = (input: {
  readonly timeRange: z.infer<typeof signalsTimeRangeSchema> | undefined
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

export const TAG_AGGREGATION_FALLBACK_DAYS = 30

export const resolveTagsTimeRange = (input: {
  readonly timeRange: ScoreAnalyticsTimeRange | undefined
  readonly now: Date
}): SignalTagsTimeRange => {
  if (input.timeRange?.from) {
    return input.timeRange.to ? { from: input.timeRange.from, to: input.timeRange.to } : { from: input.timeRange.from }
  }
  const to = input.timeRange?.to ?? input.now
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - TAG_AGGREGATION_FALLBACK_DAYS)
  return { from, to }
}

export const toScoreAnalyticsTimeRange = (
  timeRange: z.infer<typeof signalsTimeRangeSchema> | undefined,
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

export const buildDailyBucketScaffold = (input: { readonly from: Date; readonly to: Date }): readonly string[] => {
  const buckets: string[] = []
  const cursor = new Date(input.from)
  cursor.setUTCHours(0, 0, 0, 0)

  while (cursor.getTime() <= input.to.getTime()) {
    buckets.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return buckets
}

export const matchesLifecycleGroup = (
  candidate: AnalyticsCandidate,
  lifecycleGroup: SignalsLifecycleGroup | undefined,
): boolean => {
  if (lifecycleGroup === undefined) {
    return true
  }

  const isArchived = candidate.issue.ignoredAt !== null || candidate.lifecycleStates.includes(SignalState.Resolved)
  return lifecycleGroup === "archived" ? isArchived : !isArchived
}

export const matchesAssigneeFilter = (
  candidate: AnalyticsCandidate,
  assigneeIds: readonly SignalAssigneeFilter[] | undefined,
): boolean => {
  if (assigneeIds === undefined) {
    return true
  }

  return assigneeIds.includes(candidate.issue.assigneeId ?? UNASSIGNED_FILTER)
}

const toPriorityGroup = (priority: SignalPriority | null): SignalPriorityGroup => priority ?? "none"

export const emptyPriorityCounts = (): Record<SignalPriorityGroup, number> =>
  Object.fromEntries(SIGNAL_PRIORITY_GROUPS.map((group) => [group, 0])) as Record<SignalPriorityGroup, number>

export const toPriorityCounts = (candidates: readonly AnalyticsCandidate[]): Record<SignalPriorityGroup, number> => {
  const counts = emptyPriorityCounts()
  for (const candidate of candidates) {
    counts[toPriorityGroup(candidate.issue.priority)] += 1
  }
  return counts
}

export const toAssigneeCounts = (candidates: readonly AnalyticsCandidate[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const candidate of candidates) {
    const key = candidate.issue.assigneeId ?? UNASSIGNED_FILTER
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

const compareDesc = (left: number, right: number): number => right - left
const compareAsc = (left: number, right: number): number => left - right

const LIFECYCLE_STATE_PRIORITY: Record<string, number> = {
  [SignalState.Regressed]: 0,
  [SignalState.Escalating]: 1,
  [SignalState.New]: 2,
  [SignalState.Ongoing]: 3,
  [SignalState.Resolved]: 4,
  [SignalState.Ignored]: 5,
}

const UNKNOWN_STATE_PRIORITY = 99

const getPrimaryStatePriority = (states: readonly string[]): number => {
  let best = UNKNOWN_STATE_PRIORITY
  for (const state of states) {
    const priority = LIFECYCLE_STATE_PRIORITY[state]
    if (priority !== undefined && priority < best) {
      best = priority
    }
  }
  return best
}

export const sortCandidates = (
  candidates: readonly AnalyticsCandidate[],
  input: {
    readonly field: SignalsSortField
    readonly direction: SignalsSortDirection
    readonly hasSearch: boolean
  },
): readonly AnalyticsCandidate[] =>
  [...candidates].sort((left, right) => {
    const priorityComparison = compareAsc(
      SIGNAL_PRIORITY_ORDER[toPriorityGroup(left.issue.priority)],
      SIGNAL_PRIORITY_ORDER[toPriorityGroup(right.issue.priority)],
    )
    if (priorityComparison !== 0) {
      return priorityComparison
    }

    if (input.field === "occurrences") {
      const occurrencesComparison =
        input.direction === "asc"
          ? compareAsc(left.windowMetric.occurrences, right.windowMetric.occurrences)
          : compareDesc(left.windowMetric.occurrences, right.windowMetric.occurrences)
      if (occurrencesComparison !== 0) {
        return occurrencesComparison
      }
    } else if (input.field === "affectedSessions") {
      const affectedSessionsComparison =
        input.direction === "asc"
          ? compareAsc(left.windowMetric.affectedSessions, right.windowMetric.affectedSessions)
          : compareDesc(left.windowMetric.affectedSessions, right.windowMetric.affectedSessions)
      if (affectedSessionsComparison !== 0) {
        return affectedSessionsComparison
      }
    } else if (input.field === "state") {
      const leftPriority = getPrimaryStatePriority(left.lifecycleStates)
      const rightPriority = getPrimaryStatePriority(right.lifecycleStates)
      const stateComparison =
        input.direction === "asc" ? compareDesc(leftPriority, rightPriority) : compareAsc(leftPriority, rightPriority)
      if (stateComparison !== 0) {
        return stateComparison
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

export const toCandidate = (input: {
  readonly issue: SignalWithLifecycle
  readonly windowMetric: SignalWindowMetric
  readonly similarityScore: number | null
  readonly now: Date
}): AnalyticsCandidate => {
  const lifecycleStates = deriveSignalLifecycleStates({
    issue: input.issue,
    isEscalating: input.issue.lifecycle.isEscalating,
    isRegressed: input.issue.lifecycle.isRegressed,
    now: input.now,
  })

  return {
    issue: input.issue,
    windowMetric: input.windowMetric,
    lifecycleStates,
    similarityScore: input.similarityScore,
    firstSeenAt: input.windowMetric.firstSeenAt,
    lastSeenAt: input.windowMetric.lastSeenAt,
    escalationOccurrenceThreshold: null,
  }
}

export const makeZeroWindowMetric = (issue: SignalWithLifecycle): SignalWindowMetric => ({
  signalId: issue.id,
  occurrences: 0,
  affectedSessions: 0,
  firstSeenAt: issue.createdAt,
  lastSeenAt: issue.createdAt,
})

export const toLightListItem = (issue: SignalWithLifecycle, now: Date): SignalListItem => {
  const states = deriveSignalLifecycleStates({
    issue,
    isEscalating: issue.lifecycle.isEscalating,
    isRegressed: issue.lifecycle.isRegressed,
    now,
  })

  return {
    id: issue.id,
    projectId: issue.projectId,
    slug: issue.slug,
    name: issue.name,
    description: issue.description,
    source: issue.source,
    states,
    assigneeId: issue.assigneeId,
    priority: issue.priority,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    escalatedAt: issue.escalatedAt,
    resolvedAt: issue.resolvedAt,
    ignoredAt: issue.ignoredAt,
    firstSeenAt: issue.createdAt,
    lastSeenAt: issue.updatedAt,
    occurrences: 0,
    similarityScore: null,
    affectedSessionsPercent: 0,
    escalationOccurrenceThreshold: null,
    trend: [],
    evaluations: [],
    tags: [],
  }
}

export const toAnalyticsCounts = (candidates: readonly AnalyticsCandidate[]): SignalListAnalyticsCounts => ({
  newSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.New)).length,
  escalatingSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.Escalating))
    .length,
  ongoingSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.Ongoing)).length,
  regressedSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.Regressed)).length,
  resolvedSignals: candidates.filter((candidate) => candidate.lifecycleStates.includes(SignalState.Resolved)).length,
  seenOccurrences: candidates.reduce((sum, candidate) => sum + candidate.windowMetric.occurrences, 0),
})

export const buildSessionCountFilters = (
  timeRange: z.infer<typeof signalsTimeRangeSchema> | undefined,
): FilterSet | undefined => {
  const startTimeConditions: FilterCondition[] = []
  if (timeRange?.from) {
    startTimeConditions.push({ op: "gte", value: timeRange.from.toISOString() })
  }
  if (timeRange?.to) {
    startTimeConditions.push({ op: "lte", value: timeRange.to.toISOString() })
  }
  return startTimeConditions.length > 0 ? { startTime: startTimeConditions } : undefined
}

export const buildHistogramScaffold = (input: {
  readonly timeRange: z.infer<typeof signalsTimeRangeSchema> | undefined
  readonly now: Date
}) => {
  const histogramTimeRange = resolveHistogramTimeRange(input)
  const histogramBucketSeconds = pickTraceHistogramBucketSeconds(
    histogramTimeRange.from.getTime(),
    histogramTimeRange.to.getTime(),
  )
  const histogramScaffold = buildHistogramBucketScaffold({
    from: histogramTimeRange.from,
    to: histogramTimeRange.to,
    bucketSeconds: histogramBucketSeconds,
  })
  return { histogramTimeRange, histogramBucketSeconds, histogramScaffold }
}

export const emptyAnalytics = (input: {
  readonly histogramScaffold: ReturnType<typeof buildHistogramBucketScaffold>
  readonly histogramBucketSeconds: number
  readonly totalSessions?: number
}) => ({
  counts: {
    newSignals: 0,
    escalatingSignals: 0,
    ongoingSignals: 0,
    regressedSignals: 0,
    resolvedSignals: 0,
    seenOccurrences: 0,
  },
  histogram: fillBuckets({ scaffold: input.histogramScaffold, buckets: [] as readonly SignalOccurrenceBucket[] }),
  histogramBucketSeconds: input.histogramBucketSeconds,
  totalSessions: input.totalSessions ?? 0,
})

export const mergeListItemWithRowMetrics = (
  item: SignalListItem,
  metrics:
    | {
        readonly occurrences: number
        readonly affectedSessionsPercent: number
        readonly trend: readonly SignalOccurrenceBucket[]
        readonly firstSeenAt: Date
        readonly lastSeenAt: Date
        readonly tags: readonly string[]
        readonly escalationOccurrenceThreshold: number | null
      }
    | undefined,
): SignalListItem => ({
  ...item,
  firstSeenAt: metrics?.firstSeenAt ?? item.firstSeenAt,
  lastSeenAt: metrics?.lastSeenAt ?? item.lastSeenAt,
  occurrences: metrics?.occurrences ?? item.occurrences,
  affectedSessionsPercent: metrics?.affectedSessionsPercent ?? item.affectedSessionsPercent,
  escalationOccurrenceThreshold: metrics?.escalationOccurrenceThreshold ?? item.escalationOccurrenceThreshold,
  trend: metrics?.trend ?? item.trend,
  tags: metrics?.tags ?? item.tags,
})
