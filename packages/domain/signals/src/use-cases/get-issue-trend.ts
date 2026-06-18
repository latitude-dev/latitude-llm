import { ScoreAnalyticsRepository, type SignalOccurrenceBucket } from "@domain/scores"
import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SignalId } from "@domain/shared"
import { Effect } from "effect"

const TWELVE_HOURS_SECONDS = 12 * 60 * 60
const DEFAULT_TREND_DAYS = 14

export interface GetSignalTrendInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
  /** Inclusive lower bound. Defaults to ~14 days before `to`. */
  readonly from?: Date
  /** Inclusive upper bound. Defaults to "now". */
  readonly to?: Date
  readonly now?: Date
}

export interface GetSignalTrendResult {
  /** One entry per 12h bucket between `from` and `to`. Empty buckets are returned with `count: 0`. */
  readonly buckets: readonly SignalOccurrenceBucket[]
}

export type GetSignalTrendError = RepositoryError

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

const toUtcDayStart = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0))

const buildScaffold = (input: {
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
}): readonly SignalOccurrenceBucket[] => {
  const countsByBucket = new Map(input.buckets.map((bucket) => [bucket.bucket, bucket.count] as const))
  return input.scaffold.map((bucket) => ({
    bucket,
    count: countsByBucket.get(bucket) ?? 0,
  }))
}

/**
 * Returns the occurrence histogram for one issue over `[from, to]` (defaults
 * to the trailing 14 days). Buckets are 12-hour wide and UTC-aligned, with
 * empty buckets filled in so the caller can render a chart without
 * post-processing.
 */
export const getSignalTrendUseCase = (
  input: GetSignalTrendInput,
): Effect.Effect<GetSignalTrendResult, GetSignalTrendError, ChSqlClient | ScoreAnalyticsRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("signalId", String(input.signalId))

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const now = input.now ?? new Date()
    const to = input.to ? toUtcDayEnd(input.to) : toUtcDayEnd(now)
    const from = input.from
      ? toUtcDayStart(input.from)
      : (() => {
          const start = new Date(to)
          start.setUTCDate(start.getUTCDate() - (DEFAULT_TREND_DAYS - 1))
          start.setUTCHours(0, 0, 0, 0)
          return start
        })()

    const rawBuckets = yield* scoreAnalyticsRepository.histogramBySignals({
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalIds: [input.signalId],
      timeRange: { from, to },
      bucketSeconds: TWELVE_HOURS_SECONDS,
    })

    const scaffold = buildScaffold({ from, to, bucketSeconds: TWELVE_HOURS_SECONDS })
    const buckets = fillBuckets({ scaffold, buckets: rawBuckets })

    return { buckets } satisfies GetSignalTrendResult
  }).pipe(Effect.withSpan("issues.getSignalTrend"))
