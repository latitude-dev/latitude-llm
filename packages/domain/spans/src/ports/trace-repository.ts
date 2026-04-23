import type {
  ChSqlClient,
  FilterSet,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  TraceId,
} from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
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
    readonly cohort?: TraceCohortListingSpec
  }): Effect.Effect<number, RepositoryError, ChSqlClient>

  aggregateMetricsByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly cohort?: TraceCohortListingSpec
  }): Effect.Effect<TraceMetrics, RepositoryError, ChSqlClient>

  /** Per-bucket trace counts over `start_time`, using the same filter semantics as list/count. */
  histogramByProjectId(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly bucketSeconds: number
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

export interface TraceTimeHistogramBucket {
  /** Bucket start instant (UTC ISO string). */
  readonly bucketStart: string
  readonly traceCount: number
}

export class TraceRepository extends ServiceMap.Service<TraceRepository, TraceRepositoryShape>()(
  "@domain/spans/TraceRepository",
) {}
