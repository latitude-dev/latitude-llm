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
import { Context, type Effect } from "effect"
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

/**
 * Signals consumed by the seasonal-anomaly escalation detector.
 *
 * `recent_*` are sliding counts over the trailing window read from raw
 * `scores`. `expected_*` and `stddev_*` are pooled across the same
 * (day-of-week, hour ± 1) bins over the last `SEASONAL_HISTORY_WEEKS`
 * weeks, read from the `scores_hourly_buckets` MV. The 6-hour window
 * lives in a per-hour rate (`expected6hPerHour`, `recent6h / 6`) so the
 * two windows compare in the same unit.
 *
 * `samplesCount` is how many distinct prior weeks contributed any data to
 * the (dow, hour) bin pool — fewer means the band is on shakier ground
 * and the helper inflates `k` in response.
 */
export interface IssueEscalationSignals {
  readonly issueId: IssueId
  readonly recent1h: number
  readonly recent6h: number
  readonly recent24h: number
  readonly expected1h: number
  readonly expected6hPerHour: number
  readonly stddev1h: number
  readonly stddev6hPerHour: number
  readonly samplesCount: number
}

/** A single time-bucket for issue occurrence time-series. */
export interface IssueOccurrenceBucket {
  readonly bucket: string // ISO date string
  readonly count: number
}

/**
 * Per-bucket escalation threshold projection for an issue's trend chart.
 *
 * For each chart bucket we sum the per-hour seasonal expectation across the
 * hours it spans and combine the per-hour stddevs in quadrature (variances
 * add for independent hours): `threshold = sum(expected_h) + k_short ·
 * sqrt(sum(σ_h^2))`. Same `expected`/`σ` math as the live detector — same
 * `(dow, hour ± 1)` pool over the last `SEASONAL_HISTORY_WEEKS` weeks, same
 * variance floor — just projected across the whole histogram window in one
 * shot instead of evaluated at a single "now". The line and the bars are
 * therefore in the same unit: when a bar clears the line, that bucket would
 * push the 1h short window past its entry band.
 *
 * `bucket` matches the corresponding `IssueOccurrenceBucket.bucket` key
 * 1:1 so the consumer can zip the two arrays without re-keying.
 */
export interface IssueEscalationThresholdBucket {
  readonly bucket: string
  readonly thresholdCount: number
}

/** Grouped per-issue threshold result for batched chart reads. */
export interface IssueEscalationThresholdSeries {
  readonly issueId: IssueId
  readonly buckets: readonly IssueEscalationThresholdBucket[]
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

/** Per-issue rollup of tags across all traces affected by the issue. */
export interface IssueTagsAggregate {
  readonly issueId: IssueId
  readonly tags: readonly string[]
}

/**
 * Time range used when aggregating issue tags. A lower bound is required
 * (not just allowed) so the CH scans on `scores` and `traces` always have a
 * partition-pruning predicate — see `aggregateTagsByIssues` for context.
 */
export interface IssueTagsTimeRange {
  readonly from: Date
  readonly to?: Date
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

  // -- Per-issue signals for the seasonal-anomaly escalation detector --------
  // Reads:
  //   • sliding 1h / 6h / 24h counts from raw `scores` (small scan, PK lookup)
  //   • pooled (dow, hour ± 1) × prior weeks expected/stddev from the
  //     `scores_hourly_buckets` materialized view (constant cost regardless of
  //     score volume).
  // The repository never applies the σ floor or the cold-start `k` inflation —
  // those rules live in the `evaluateSeasonalEscalation` helper so the data
  // returned here is the raw observation.
  escalationSignalsByIssues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly now?: Date // overridable for tests; defaults to now() inside the query
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueEscalationSignals[], RepositoryError, ChSqlClient>

  // -- Issue tag aggregation across affected traces --------------------------
  // `timeRange.from` is required to keep the underlying scans partition-bounded
  // (see implementation comment for context). `to` defaults to "now".
  aggregateTagsByIssues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly timeRange: IssueTagsTimeRange
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueTagsAggregate[], RepositoryError, ChSqlClient>

  // -- Issue occurrence time-series ------------------------------------------
  /**
   * Per-issue trend over the last `days` (default 30) bucketed by `bucketSeconds`. Bucket keys
   * are emitted as ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS.000Z`) regardless of interval —
   * the consumer is responsible for any shorter-form formatting in the UI.
   */
  trendByIssue(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly days?: number // default 30
    readonly bucketSeconds: number
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
  /**
   * Project-wide issue-occurrence histogram bucketed by `bucketSeconds`. Bucket keys are emitted
   * as ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS.000Z`) regardless of interval.
   */
  histogramByIssues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly filters?: FilterSet
    readonly timeRange: ScoreAnalyticsTimeRange
    readonly bucketSeconds: number
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
  /**
   * Per-issue dashed-line projection of the entry band across the trend chart's window. For each
   * `bucketSeconds`-wide bucket we sum the `(dow, hour)`-pooled expected counts over the hours the
   * bucket spans and combine the per-hour σ in quadrature, then add `kShort · σ_bucket`. The
   * pool always uses `SEASONAL_HISTORY_WEEKS` weeks of history **prior to `timeRange.from`** so
   * the line stays stable across the visible window (it's a "given what's been typical at this
   * time of week" reference, not a backtest).
   *
   * The line and the bars are in the same unit. Buckets clearing the line are buckets that —
   * within the 1h short window — would push the detector past its entry band at the matching
   * hour. The 6h window's contribution to the AND is NOT layered on; the line is a single
   * easy-to-read reference, not a perfect replay of the detector's compound rule.
   */
  escalationThresholdHistogramByIssues(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly timeRange: ScoreAnalyticsTimeRange
    readonly bucketSeconds: number
    readonly kShort: number
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly IssueEscalationThresholdSeries[], RepositoryError, ChSqlClient>
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
  countTracesByIssue(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<number, RepositoryError, ChSqlClient>
}

export class ScoreAnalyticsRepository extends Context.Service<
  ScoreAnalyticsRepository,
  ScoreAnalyticsRepositoryShape
>()("@domain/scores/ScoreAnalyticsRepository") {}
