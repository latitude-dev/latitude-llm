import type { OrganizationId, ProjectId, RepositoryError, SignalId } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * Per-day count of an event-typed metric for a project (e.g. trace
 * volume). Bucket start is the bucket's lower edge, exclusive upper
 * edge.
 */
export interface ProjectMetricCountBucket {
  readonly bucketStart: Date
  readonly count: number
}

/**
 * Per-day annotation counts split by outcome. `failedCount` rolls up
 * both `passed=false` and `errored=true` since "errored" is a flavour
 * of failure on the score entity (the schema represents it as a
 * disjoint subset of `passed=false`).
 */
export interface ProjectAnnotationBucket {
  readonly bucketStart: Date
  readonly passedCount: number
  readonly failedCount: number
}

export interface ProjectTopSignalOccurrence {
  readonly signalId: SignalId
  readonly occurrences: number
  readonly lastSeenAt: Date
}

export interface ProjectMetricHistogramInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly since: Date
  /** Bucket size — caller picks (24h for daily, etc.). */
  readonly bucketSeconds: number
}

export interface ProjectTopSignalsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly since: Date
  readonly limit: number
}

/**
 * Cross-organisation, ClickHouse-backed metrics port for the backoffice
 * project page. Methods aggregate raw event tables (`traces`, `scores`)
 * into time-bucketed series and top-N issue rankings.
 *
 * WARNING: cross-organisation by design — the ClickHouse client carries
 * no per-tenant ACL. Only wire into handlers that have already passed
 * `adminMiddleware`. Live layer ships in `@platform/db-clickhouse`.
 */
export class AdminProjectMetricsRepository extends Context.Service<
  AdminProjectMetricsRepository,
  {
    /**
     * Daily trace-count buckets for the given project. Mirrors the
     * shape used by `TraceRepository.histogramByProjectId` but without
     * filters / search — the backoffice panel always shows total
     * traffic. Returned buckets are sparse (only days with traces);
     * callers densify against the requested window.
     */
    getTraceHistogram(
      input: ProjectMetricHistogramInput,
    ): Effect.Effect<readonly ProjectMetricCountBucket[], RepositoryError>

    /**
     * Daily counts of manual annotations (scores with `source = 'annotation'`)
     * split by outcome — `passed=true` and `passed=false`. Sparse —
     * same densify policy as `getTraceHistogram`.
     */
    getAnnotationHistogram(
      input: ProjectMetricHistogramInput,
    ): Effect.Effect<readonly ProjectAnnotationBucket[], RepositoryError>

    /**
     * Top-N issues by occurrences in the window. "Occurrence" = score row
     * with non-empty `issue_id` matching this issue, same definition the
     * user-facing Signals page uses.
     */
    getTopSignalsByOccurrences(
      input: ProjectTopSignalsInput,
    ): Effect.Effect<readonly ProjectTopSignalOccurrence[], RepositoryError>
  }
>()("@domain/admin/AdminProjectMetricsRepository") {}
