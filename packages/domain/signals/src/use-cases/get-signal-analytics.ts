import { ScoreAnalyticsRepository, type ScoreAnalyticsTimeRange, type SignalOccurrenceBucket } from "@domain/scores"
import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SignalState } from "../entities/signal.ts"
import { deriveSignalLifecycleStates } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

const TWELVE_HOURS_SECONDS = 12 * 60 * 60
const DEFAULT_RANGE_DAYS = 7

export interface GetSignalAnalyticsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Inclusive lower bound. Defaults to ~7 days before `to`. */
  readonly from?: Date
  /** Inclusive upper bound. Defaults to "now". */
  readonly to?: Date
  readonly now?: Date
}

export interface SignalAnalyticsBucket {
  /** ISO-8601 UTC timestamp of the bucket's start. Aligned to 12-hour UTC boundaries. */
  readonly bucket: string
  readonly value: number
}

export interface SignalAnalyticsCountMetric {
  readonly total: number
}

export interface SignalAnalyticsOccurrencesMetric {
  readonly total: number
  readonly buckets: readonly SignalAnalyticsBucket[]
}

export interface GetSignalAnalyticsResult {
  readonly ongoing: SignalAnalyticsCountMetric
  readonly new: SignalAnalyticsCountMetric
  readonly escalating: SignalAnalyticsCountMetric
  readonly occurrences: SignalAnalyticsOccurrencesMetric
}

export type GetSignalAnalyticsError = RepositoryError

const toUtcDayStart = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0))

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

const resolveRange = (input: {
  readonly from?: Date
  readonly to?: Date
  readonly now: Date
}): { readonly from: Date; readonly to: Date } => {
  if (input.from && input.to) return { from: toUtcDayStart(input.from), to: toUtcDayEnd(input.to) }
  if (input.from) return { from: toUtcDayStart(input.from), to: toUtcDayEnd(input.now) }
  const to = toUtcDayEnd(input.to ?? input.now)
  const start = new Date(to)
  start.setUTCDate(start.getUTCDate() - (DEFAULT_RANGE_DAYS - 1))
  start.setUTCHours(0, 0, 0, 0)
  return { from: start, to }
}

const buildBucketScaffold = (input: {
  readonly from: Date
  readonly to: Date
  readonly bucketSeconds: number
}): readonly string[] => {
  const widthMs = input.bucketSeconds * 1000
  if (widthMs <= 0) return []
  const startMs = Math.floor(input.from.getTime() / widthMs) * widthMs
  const endMs = input.to.getTime()
  const out: string[] = []
  for (let cursor = startMs; cursor <= endMs; cursor += widthMs) {
    out.push(new Date(cursor).toISOString())
  }
  return out
}

const fillBuckets = (input: {
  readonly scaffold: readonly string[]
  readonly buckets: readonly SignalOccurrenceBucket[]
}): readonly SignalAnalyticsBucket[] => {
  const countsByBucket = new Map(input.buckets.map((bucket) => [bucket.bucket, bucket.count] as const))
  return input.scaffold.map((bucket) => ({
    bucket,
    value: countsByBucket.get(bucket) ?? 0,
  }))
}

const emptyResult = (scaffold: readonly string[]): GetSignalAnalyticsResult => ({
  ongoing: { total: 0 },
  new: { total: 0 },
  escalating: { total: 0 },
  occurrences: { total: 0, buckets: fillBuckets({ scaffold, buckets: [] }) },
})

/**
 * Returns issue analytics for `[from, to]` — lifecycle counters (ongoing, new,
 * escalating) across issues with activity in the window,
 * total occurrences, and a 12-hour UTC-aligned bucket series for occurrences.
 * Range defaults to the trailing 7 days.
 */
export const getSignalAnalyticsUseCase = (
  input: GetSignalAnalyticsInput,
): Effect.Effect<
  GetSignalAnalyticsResult,
  GetSignalAnalyticsError,
  ChSqlClient | SignalRepository | ScoreAnalyticsRepository | SqlClient
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))

    const now = input.now ?? new Date()
    const { from, to } = resolveRange({
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      now,
    })
    const scaffold = buildBucketScaffold({ from, to, bucketSeconds: TWELVE_HOURS_SECONDS })
    const timeRange: ScoreAnalyticsTimeRange = { from, to }

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const signalRepository = yield* SignalRepository

    const windowMetrics = yield* scoreAnalyticsRepository.listSignalWindowMetrics({
      organizationId: input.organizationId,
      projectId: input.projectId,
      timeRange,
    })

    if (windowMetrics.length === 0) {
      return emptyResult(scaffold)
    }

    const candidateSignalIds = windowMetrics.map((metric) => metric.signalId)
    const canonicalSignals = yield* signalRepository.findByIds({
      projectId: input.projectId,
      signalIds: candidateSignalIds,
    })

    const counts: Record<"ongoing" | "new" | "escalating", number> = {
      ongoing: 0,
      new: 0,
      escalating: 0,
    }
    for (const issue of canonicalSignals) {
      const states = deriveSignalLifecycleStates({
        issue,
        isEscalating: issue.lifecycle.isEscalating,
        now,
      })
      if (states.includes(SignalState.New)) counts.new += 1
      if (states.includes(SignalState.Escalating)) counts.escalating += 1
      if (states.includes(SignalState.Ongoing)) counts.ongoing += 1
    }

    const rawBuckets = yield* scoreAnalyticsRepository.histogramBySignals({
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalIds: candidateSignalIds,
      timeRange,
      bucketSeconds: TWELVE_HOURS_SECONDS,
    })
    const buckets = fillBuckets({ scaffold, buckets: rawBuckets })
    const occurrencesTotal = windowMetrics.reduce((sum, m) => sum + m.occurrences, 0)

    return {
      ongoing: { total: counts.ongoing },
      new: { total: counts.new },
      escalating: { total: counts.escalating },
      occurrences: { total: occurrencesTotal, buckets },
    } satisfies GetSignalAnalyticsResult
  }).pipe(Effect.withSpan("issues.getSignalAnalytics"))
