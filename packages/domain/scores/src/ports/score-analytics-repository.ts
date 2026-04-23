import type {
  ChSqlClient,
  FilterSet,
  IssueId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  ScoreId,
  SessionId,
  TraceId,
} from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Score, ScoreSource } from "../entities/score.ts"

// ---------------------------------------------------------------------------
// Aggregate shapes returned by ClickHouse analytics queries
// ---------------------------------------------------------------------------

/** Project-wide or source-scoped score aggregate. */
export interface ScoreAggregate {
  readonly totalScores: number
  readonly avgValue: number
  readonly avgDuration: number // nanoseconds
  readonly totalCost: number // microcents
  readonly totalTokens: number
  readonly passedCount: number
  readonly failedCount: number
  readonly erroredCount: number
}

/** A single time-bucket in a score trend query. */
export interface ScoreTrendBucket {
  readonly bucket: string // ISO date string (day-level: "2025-03-15")
  readonly totalScores: number
  readonly avgValue: number
  readonly passedCount: number
  readonly failedCount: number
  readonly erroredCount: number
  readonly totalCost: number // microcents
  readonly totalTokens: number
}

/** Per-trace score rollup used for trace-level score filtering. */
export interface TraceScoreRollup {
  readonly traceId: TraceId
  readonly totalScores: number
  readonly passedCount: number
  readonly failedCount: number
  readonly erroredCount: number
  readonly avgValue: number
  readonly hasIssue: boolean
  readonly sources: readonly string[]
}

/** Per-session score rollup used for session-level score filtering. */
export interface SessionScoreRollup {
  readonly sessionId: SessionId
  readonly totalScores: number
  readonly passedCount: number
  readonly failedCount: number
  readonly erroredCount: number
  readonly avgValue: number
  readonly hasIssue: boolean
  readonly sources: readonly string[]
}

/** Issue occurrence aggregate for issue lifecycle. */
export interface IssueOccurrenceAggregate {
  readonly issueId: IssueId
  readonly totalOccurrences: number
  readonly recentOccurrences: number // last 1 day
  readonly baselineAvgOccurrences: number // average daily occurrences in previous 7-day baseline
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
}

/** A single time-bucket for issue occurrence time-series. */
export interface IssueOccurrenceBucket {
  readonly bucket: string // ISO date string
  readonly count: number
}

/** Time range applied to score.created_at analytics reads. */
export interface ScoreAnalyticsTimeRange {
  readonly from?: Date
  readonly to?: Date
}

/** Per-issue occurrence rollup inside a selected score window. */
export interface IssueWindowMetric {
  readonly issueId: IssueId
  readonly occurrences: number
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
}

/** Grouped issue trend result for batched chart reads. */
export interface IssueTrendSeries {
  readonly issueId: IssueId
  readonly buckets: readonly IssueOccurrenceBucket[]
}

/** Distinct trace scoped to one issue, ordered by last seen timestamp. */
export interface IssueTraceSummary {
  readonly traceId: TraceId
  readonly lastSeenAt: Date
}

/** Paginated distinct traces for an issue. */
export interface IssueTracePage {
  readonly items: readonly IssueTraceSummary[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

/** Common options for analytics queries. */
export interface ScoreAnalyticsOptions {
  readonly excludeSimulations?: boolean
}

export interface ScoreAnalyticsRepositoryShape {
  existsById(id: ScoreId): Effect.Effect<boolean, RepositoryError, ChSqlClient>
  // TODO(repositories): rename insert -> save to keep repository write verbs
  // consistent across append-only and upsert-backed stores.
  insert(score: Score): Effect.Effect<void, RepositoryError, ChSqlClient>
  delete(id: ScoreId): Effect.Effect<void, RepositoryError, ChSqlClient>

  // -- Project-wide aggregates -----------------------------------------------
  aggregateByProject(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<ScoreAggregate, RepositoryError, ChSqlClient>

  // -- Source-scoped aggregates ----------------------------------------------
  aggregateBySource(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly source: ScoreSource
    readonly sourceId: string
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<ScoreAggregate, RepositoryError, ChSqlClient>

  // -- Source trend (time-series) --------------------------------------------
  trendBySource(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly source: ScoreSource
    readonly sourceId: string
    readonly days?: number // default 14
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly ScoreTrendBucket[], RepositoryError, ChSqlClient>

  // -- Project-wide trend ---------------------------------------------------
  trendByProject(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly days?: number // default 14
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly ScoreTrendBucket[], RepositoryError, ChSqlClient>

  // -- Trace-level rollups for score-aware filtering -------------------------
  rollupByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly TraceScoreRollup[], RepositoryError, ChSqlClient>

  // -- Session-level rollups for score-aware filtering -----------------------
  rollupBySessionIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionIds: readonly SessionId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SessionScoreRollup[], RepositoryError, ChSqlClient>

  // -- Issue occurrence aggregates for lifecycle -----------------------------
  aggregateByIssues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueOccurrenceAggregate[], RepositoryError, ChSqlClient>

  // -- Issue occurrence time-series ------------------------------------------
  trendByIssue(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly days?: number // default 30
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueOccurrenceBucket[], RepositoryError, ChSqlClient>
  listIssueWindowMetrics(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly timeRange?: ScoreAnalyticsTimeRange
    readonly issueIds?: readonly IssueId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueWindowMetric[], RepositoryError, ChSqlClient>
  histogramByIssues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly filters?: FilterSet
    readonly timeRange: ScoreAnalyticsTimeRange
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueOccurrenceBucket[], RepositoryError, ChSqlClient>
  trendByIssues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly filters?: FilterSet
    readonly timeRange: ScoreAnalyticsTimeRange
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueTrendSeries[], RepositoryError, ChSqlClient>
  countDistinctTracesByTimeRange(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly timeRange?: ScoreAnalyticsTimeRange
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<number, RepositoryError, ChSqlClient>
  listTracesByIssue(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly limit?: number
    readonly offset?: number
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<IssueTracePage, RepositoryError, ChSqlClient>
}

export class ScoreAnalyticsRepository extends ServiceMap.Service<
  ScoreAnalyticsRepository,
  ScoreAnalyticsRepositoryShape
>()("@domain/scores/ScoreAnalyticsRepository") {}
