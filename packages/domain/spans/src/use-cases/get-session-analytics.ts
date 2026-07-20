import type { ChSqlClient, FilterSet, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { denseTraceTimeHistogramBuckets } from "../helpers.ts"
import { type SessionMetrics, SessionRepository } from "../ports/session-repository.ts"

const TWELVE_HOURS_SECONDS = 12 * 60 * 60
const DEFAULT_RANGE_DAYS = 7
const NANOSECONDS_PER_SECOND = 1_000_000_000
const MICROCENTS_PER_DOLLAR = 100_000_000

const nsToSeconds = (ns: number): number => ns / NANOSECONDS_PER_SECOND
const microcentsToDollars = (mc: number): number => mc / MICROCENTS_PER_DOLLAR

export interface GetSessionAnalyticsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Inclusive lower bound. Defaults to ~7 days before `to`. */
  readonly from?: Date
  /** Inclusive upper bound. Defaults to "now". */
  readonly to?: Date
  readonly now?: Date
}

export interface SessionAnalyticsBucket {
  /** ISO-8601 UTC timestamp of the bucket's start. Aligned to 12-hour UTC boundaries. */
  readonly bucket: string
  readonly value: number
}

export interface SessionAnalyticsTotalMetric {
  readonly total: number
  readonly buckets: readonly SessionAnalyticsBucket[]
}

export interface SessionAnalyticsMedianMetric {
  readonly median: number
  readonly buckets: readonly SessionAnalyticsBucket[]
}

export interface GetSessionAnalyticsResult {
  readonly sessions: SessionAnalyticsTotalMetric
  readonly traces: SessionAnalyticsTotalMetric
  readonly cost: SessionAnalyticsTotalMetric
  readonly duration: SessionAnalyticsMedianMetric
  readonly tokens: SessionAnalyticsTotalMetric
  readonly timeToFirstToken: SessionAnalyticsMedianMetric
  readonly spans: SessionAnalyticsTotalMetric
}

export type GetSessionAnalyticsError = RepositoryError

const resolveRange = (input: {
  readonly from?: Date
  readonly to?: Date
  readonly now: Date
}): { readonly from: Date; readonly to: Date } => {
  if (input.from && input.to) return { from: input.from, to: input.to }
  if (input.from) return { from: input.from, to: input.now }
  if (input.to) {
    const from = new Date(input.to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000)
    return { from, to: input.to }
  }
  const from = new Date(input.now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000)
  return { from, to: input.now }
}

const buildTimeFilter = (from: Date, to: Date): FilterSet => ({
  startTime: [
    { op: "gte", value: from.toISOString() },
    { op: "lte", value: to.toISOString() },
  ],
})

const toTotalBuckets = (
  buckets: ReturnType<typeof denseTraceTimeHistogramBuckets>,
  pick: (bucket: (typeof buckets)[number]) => number,
): readonly SessionAnalyticsBucket[] => buckets.map((b) => ({ bucket: b.bucketStart, value: pick(b) }))

/**
 * Returns session analytics for `[from, to]` — one object per metric carrying a
 * `total` or `median` plus a 12-hour UTC-aligned bucket series. Range defaults
 * to the trailing 7 days. Parallels `getTraceAnalyticsUseCase` but computed over
 * the session aggregate, so `sessions`/`traces` counts and the per-session
 * cost/duration/token rollups reflect whole conversations, not individual traces.
 */
export const getSessionAnalyticsUseCase = (
  input: GetSessionAnalyticsInput,
): Effect.Effect<GetSessionAnalyticsResult, GetSessionAnalyticsError, ChSqlClient | SessionRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))

    const now = input.now ?? new Date()
    const { from, to } = resolveRange({
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      now,
    })
    const filters = buildTimeFilter(from, to)

    const sessionRepository = yield* SessionRepository
    const [metrics, sparseBuckets] = yield* Effect.all(
      [
        sessionRepository.aggregateMetricsByProjectId({
          organizationId: input.organizationId,
          projectId: input.projectId,
          filters,
        }) as Effect.Effect<SessionMetrics, RepositoryError, ChSqlClient>,
        sessionRepository.histogramByProjectId({
          organizationId: input.organizationId,
          projectId: input.projectId,
          filters,
          bucketSeconds: TWELVE_HOURS_SECONDS,
        }),
      ],
      { concurrency: 2 },
    )

    const buckets = denseTraceTimeHistogramBuckets(
      sparseBuckets,
      from.toISOString(),
      to.toISOString(),
      TWELVE_HOURS_SECONDS,
    )
    const sessionTotal = buckets.reduce((sum, b) => sum + b.sessionCount, 0)
    const traceTotal = buckets.reduce((sum, b) => sum + b.traceCount, 0)

    return {
      sessions: { total: sessionTotal, buckets: toTotalBuckets(buckets, (b) => b.sessionCount) },
      traces: { total: traceTotal, buckets: toTotalBuckets(buckets, (b) => b.traceCount) },
      cost: {
        total: microcentsToDollars(metrics.costTotalMicrocents.sum),
        buckets: toTotalBuckets(buckets, (b) => microcentsToDollars(b.costTotalMicrocentsSum)),
      },
      duration: {
        median: nsToSeconds(metrics.durationNs.median),
        buckets: toTotalBuckets(buckets, (b) => nsToSeconds(b.durationNsMedian)),
      },
      tokens: { total: metrics.tokensTotal.sum, buckets: toTotalBuckets(buckets, (b) => b.tokensTotalSum) },
      timeToFirstToken: {
        median: nsToSeconds(metrics.timeToFirstTokenNs.median),
        buckets: toTotalBuckets(buckets, (b) => nsToSeconds(b.timeToFirstTokenNsMedian)),
      },
      spans: { total: metrics.spanCount.sum, buckets: toTotalBuckets(buckets, (b) => b.spanCountSum) },
    } satisfies GetSessionAnalyticsResult
  }).pipe(Effect.withSpan("spans.getSessionAnalytics"))
