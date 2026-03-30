import type { IssueId, OrganizationId, ProjectId, RepositoryError, ScoreId, SessionId, TraceId } from "@domain/shared"
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
  readonly firstSeenAt: string // ISO date
  readonly lastSeenAt: string // ISO date
}

/** A single time-bucket for issue occurrence time-series. */
export interface IssueOccurrenceBucket {
  readonly bucket: string // ISO date string
  readonly count: number
}

/** Common options for analytics queries. */
export interface ScoreAnalyticsOptions {
  readonly excludeSimulations?: boolean
}

export interface ScoreAnalyticsRepositoryShape {
  existsById(id: ScoreId): Effect.Effect<boolean, RepositoryError>
  insert(score: Score): Effect.Effect<void, RepositoryError>
  deleteById(id: ScoreId): Effect.Effect<void, RepositoryError>

  // -- Project-wide aggregates -----------------------------------------------
  aggregateByProject(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<ScoreAggregate, RepositoryError>

  // -- Source-scoped aggregates ----------------------------------------------
  aggregateBySource(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly source: ScoreSource
    readonly sourceId: string
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<ScoreAggregate, RepositoryError>

  // -- Source trend (time-series) --------------------------------------------
  trendBySource(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly source: ScoreSource
    readonly sourceId: string
    readonly days?: number // default 14
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly ScoreTrendBucket[], RepositoryError>

  // -- Project-wide trend ---------------------------------------------------
  trendByProject(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly days?: number // default 14
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly ScoreTrendBucket[], RepositoryError>

  // -- Trace-level rollups for score-aware filtering -------------------------
  rollupByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly TraceScoreRollup[], RepositoryError>

  // -- Session-level rollups for score-aware filtering -----------------------
  rollupBySessionIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionIds: readonly SessionId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SessionScoreRollup[], RepositoryError>

  // -- Issue occurrence aggregates for lifecycle -----------------------------
  aggregateByIssues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueOccurrenceAggregate[], RepositoryError>

  // -- Issue occurrence time-series ------------------------------------------
  trendByIssue(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly days?: number // default 30
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueOccurrenceBucket[], RepositoryError>
}

export class ScoreAnalyticsRepository extends ServiceMap.Service<
  ScoreAnalyticsRepository,
  ScoreAnalyticsRepositoryShape
>()("@domain/scores/ScoreAnalyticsRepository") {}
