import type {
  ChSqlClient,
  FilterSet,
  NotFoundError,
  OrganizationId,
  PercentileTraceFilterField,
  ProjectId,
  RepositoryError,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CohortBaselineData } from "../cohort-baselines.ts"
import type { Trace, TraceConversationChunk, TraceDetail, TraceMetadataDetail } from "../entities/trace.ts"

/**
 * Repository port for traces (ClickHouse materialized view).
 *
 * No insert method — the traces table is populated automatically
 * by a materialized view on each insert into spans.
 */
export interface TraceRepositoryShape {
  /**
   * Baseline percentiles across every trace in the project. Intentionally
   * ignores user filters — the goal is a stable "what's normal for this
   * project" reference.
   */
  getCohortBaseline(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly excludeTraceId?: TraceId
  }): Effect.Effect<CohortBaselineData, RepositoryError, ChSqlClient>

  listByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options: TraceListOptions
  }): Effect.Effect<TraceListPage, RepositoryError, ChSqlClient>

  countByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly searchQuery?: string
  }): Effect.Effect<number, RepositoryError, ChSqlClient>

  /** Latest `start_time` across traces matching the same filter + search semantics as `countByProjectId`. */
  findLastTraceAt(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly searchQuery?: string
  }): Effect.Effect<Date | null, RepositoryError, ChSqlClient>

  /**
   * Count of traces matching the same filter + search semantics as `countByProjectId` that have at
   * least one `source = 'annotation'` score linked. The shared `searchQuery` path requires AI
   * embeddings, so the platform implementation depends on `AiEmbed` like the other read methods do.
   */
  countAnnotatedByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly searchQuery?: string
  }): Effect.Effect<number, RepositoryError, ChSqlClient>

  aggregateMetricsByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly searchQuery?: string
  }): Effect.Effect<TraceMetrics, RepositoryError, ChSqlClient>

  /** Per-bucket trace counts over `start_time`, using the same filter semantics as list/count. */
  histogramByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly bucketSeconds: number
    readonly searchQuery?: string
  }): Effect.Effect<readonly TraceTimeHistogramBucket[], RepositoryError, ChSqlClient>

  findByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }): Effect.Effect<TraceDetail, NotFoundError | RepositoryError, ChSqlClient>

  findSummaryByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }): Effect.Effect<Trace, NotFoundError | RepositoryError, ChSqlClient>

  findMetadataByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }): Effect.Effect<TraceMetadataDetail, NotFoundError | RepositoryError, ChSqlClient>

  findConversationChunk(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly offset: number
    readonly limit: number
  }): Effect.Effect<TraceConversationChunk, RepositoryError, ChSqlClient>

  matchesFiltersByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly filters?: FilterSet
  }): Effect.Effect<boolean, RepositoryError, ChSqlClient>

  listMatchingFilterIdsByTraceId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly filterSets: readonly TraceFilterSetMatchCandidate[]
  }): Effect.Effect<readonly string[], RepositoryError, ChSqlClient>

  listByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
  }): Effect.Effect<readonly TraceDetail[], RepositoryError, ChSqlClient>

  distinctFilterValues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly column: TraceDistinctColumn
    readonly limit?: number
    readonly search?: string
  }): Effect.Effect<readonly string[], RepositoryError, ChSqlClient>

  /**
   * Numeric distribution of one trace column for the project, sampled at every
   * integer percentile (p0, p1, ..., p100 — 101 values). Intentionally ignores
   * other user filters so the visualization is stable while the user picks a
   * threshold; the threshold is then resolved against this same distribution.
   */
  getDistribution(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly field: PercentileTraceFilterField
  }): Effect.Effect<TraceDistribution, RepositoryError, ChSqlClient>
}

export type TraceDistinctColumn = "userId" | "tags" | "models" | "providers" | "serviceNames" | "tools" | "definedTools"

export interface TraceFilterSetMatchCandidate {
  readonly filterId: string
  readonly filters?: FilterSet
}

export interface TraceListCursor {
  readonly sortValue: string
  readonly secondaryValue?: string | undefined
  readonly traceId: string
}

export interface TraceListOptions {
  readonly limit?: number
  readonly cursor?: TraceListCursor
  readonly sortBy?: string
  readonly sortDirection?: "asc" | "desc"
  readonly filters?: FilterSet
  readonly searchQuery?: string
}

export interface TraceListPage {
  readonly items: readonly Trace[]
  readonly hasMore: boolean
  readonly nextCursor?: TraceListCursor
}

/** Min / max / avg / median / sum for one numeric field (project-scoped aggregate, not paginated). */
export interface NumericRollup {
  readonly min: number
  readonly max: number
  readonly avg: number
  readonly median: number
  readonly sum: number
}

/**
 * Token-weighted token analytics over the filtered set (not per-row averages):
 * `cacheHitRate` is `cacheReadTokens / (inputTokens + cacheReadTokens + cacheCreateTokens)`,
 * `null` when there are no input-side tokens. Token fields are summed totals.
 */
export interface TokenAnalyticsAggregate {
  readonly cacheHitRate: number | null
  readonly inputTokens: number
  readonly cacheReadTokens: number
  readonly cacheCreateTokens: number
  readonly outputTokens: number
}

export const emptyTokenAnalytics = (): TokenAnalyticsAggregate => ({
  cacheHitRate: null,
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  outputTokens: 0,
})

export interface TraceMetrics {
  readonly durationNs: NumericRollup
  readonly costTotalMicrocents: NumericRollup
  readonly spanCount: NumericRollup
  readonly tokensTotal: NumericRollup
  readonly timeToFirstTokenNs: NumericRollup
  readonly tokenAnalytics: TokenAnalyticsAggregate
}

const zeroRollup = (): NumericRollup => ({ min: 0, max: 0, avg: 0, median: 0, sum: 0 })

/** Metrics when no traces match the filter (same shape as a populated aggregate). */
export const emptyTraceMetrics = (): TraceMetrics => ({
  durationNs: zeroRollup(),
  costTotalMicrocents: zeroRollup(),
  spanCount: zeroRollup(),
  tokensTotal: zeroRollup(),
  timeToFirstTokenNs: zeroRollup(),
  tokenAnalytics: emptyTokenAnalytics(),
})

/**
 * Per-bucket aggregates for the traces histogram. Each bucket carries one value per supported
 * `TraceHistogramMetric` so the frontend can swap which series it renders without refetching.
 * Keep this in sync with `TRACE_HISTOGRAM_METRICS` and the columns selected in
 * `TraceRepository.histogramByProjectId`.
 */
export interface TraceTimeHistogramBucket {
  /** Bucket start instant (UTC ISO string). */
  readonly bucketStart: string
  readonly traceCount: number
  readonly sessionCount: number
  readonly costTotalMicrocentsSum: number
  readonly durationNsMedian: number
  readonly tokensTotalSum: number
  readonly spanCountSum: number
  readonly timeToFirstTokenNsMedian: number
  readonly tokensInputSum: number
  readonly tokensCacheReadSum: number
  readonly tokensCacheCreateSum: number
}

export const TRACE_HISTOGRAM_METRICS = [
  "sessions",
  "cost",
  "duration",
  "tokens",
  "cacheHitRate",
  "traces",
  "spans",
] as const

export type TraceHistogramMetric = (typeof TRACE_HISTOGRAM_METRICS)[number]

export const isTraceHistogramMetric = (value: string): value is TraceHistogramMetric =>
  (TRACE_HISTOGRAM_METRICS as readonly string[]).includes(value)

/**
 * Per-percentile values for a single numeric trace column.
 *
 * `percentileValues[p]` (for `p` in 0..100) is the value at the p-th percentile
 * of the project's trace distribution. Empty distributions return all zeros and
 * `count: 0`; consumers should treat that as "no data, no filter possible".
 */
export interface TraceDistribution {
  readonly count: number
  readonly percentileValues: readonly number[]
}

/** Empty distribution (all-zero percentile values, count 0). */
export const emptyTraceDistribution = (): TraceDistribution => ({
  count: 0,
  percentileValues: new Array(101).fill(0),
})

export const emptyTraceTimeHistogramBucket = (bucketStart: string): TraceTimeHistogramBucket => ({
  bucketStart,
  traceCount: 0,
  sessionCount: 0,
  costTotalMicrocentsSum: 0,
  durationNsMedian: 0,
  tokensTotalSum: 0,
  spanCountSum: 0,
  timeToFirstTokenNsMedian: 0,
  tokensInputSum: 0,
  tokensCacheReadSum: 0,
  tokensCacheCreateSum: 0,
})

export class TraceRepository extends Context.Service<TraceRepository, TraceRepositoryShape>()(
  "@domain/spans/TraceRepository",
) {}
