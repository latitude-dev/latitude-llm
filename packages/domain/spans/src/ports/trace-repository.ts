import type {
  ChSqlClient,
  FilterSet,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  TraceId,
} from "@domain/shared"
import { type Effect, Context } from "effect"
import type { Trace, TraceDetail } from "../entities/trace.ts"
import type { TraceCohortBaselineData } from "../trace-cohorts.ts"

/**
 * Repository port for traces (ClickHouse materialized view).
 *
 * No insert method — the traces table is populated automatically
 * by a materialized view on each insert into spans.
 */
export interface TraceRepositoryShape {
  /**
   * Baseline percentiles scoped to the exact tag combination. Empty `tags` array
   * matches only untagged traces. Tag match is order-independent set equality.
   * Intentionally ignores user filters — the goal is a stable "what's normal for
   * this kind of trace" reference.
   */
  getCohortBaselineByTags(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly tags: ReadonlyArray<string>
    readonly excludeTraceId?: TraceId
  }): Effect.Effect<TraceCohortBaselineData, RepositoryError, ChSqlClient>

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
}

export type TraceDistinctColumn = "tags" | "models" | "providers" | "serviceNames"

export interface TraceFilterSetMatchCandidate {
  readonly filterId: string
  readonly filters?: FilterSet
}

export interface TraceListCursor {
  readonly sortValue: string
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

export interface TraceMetrics {
  readonly durationNs: NumericRollup
  readonly costTotalMicrocents: NumericRollup
  readonly spanCount: NumericRollup
  readonly tokensTotal: NumericRollup
  readonly timeToFirstTokenNs: NumericRollup
}

const zeroRollup = (): NumericRollup => ({ min: 0, max: 0, avg: 0, median: 0, sum: 0 })

/** Metrics when no traces match the filter (same shape as a populated aggregate). */
export const emptyTraceMetrics = (): TraceMetrics => ({
  durationNs: zeroRollup(),
  costTotalMicrocents: zeroRollup(),
  spanCount: zeroRollup(),
  tokensTotal: zeroRollup(),
  timeToFirstTokenNs: zeroRollup(),
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
  readonly costTotalMicrocentsSum: number
  readonly durationNsMedian: number
  readonly tokensTotalSum: number
  readonly spanCountSum: number
  readonly timeToFirstTokenNsMedian: number
}

/** Metric series the traces histogram can render. Order matches the metric cards above the chart. */
export const TRACE_HISTOGRAM_METRICS = ["traces", "cost", "duration", "tokens", "ttft", "spans"] as const

export type TraceHistogramMetric = (typeof TRACE_HISTOGRAM_METRICS)[number]

export const isTraceHistogramMetric = (value: string): value is TraceHistogramMetric =>
  (TRACE_HISTOGRAM_METRICS as readonly string[]).includes(value)

export const emptyTraceTimeHistogramBucket = (bucketStart: string): TraceTimeHistogramBucket => ({
  bucketStart,
  traceCount: 0,
  costTotalMicrocentsSum: 0,
  durationNsMedian: 0,
  tokensTotalSum: 0,
  spanCountSum: 0,
  timeToFirstTokenNsMedian: 0,
})

export class TraceRepository extends Context.Service<TraceRepository, TraceRepositoryShape>()(
  "@domain/spans/TraceRepository",
) {}
