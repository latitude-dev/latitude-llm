import type {
  ChSqlClient,
  ExternalUserId,
  FilterSet,
  OrganizationId,
  ProjectId,
  RepositoryError,
  ScoreId,
  SessionId,
  SignalId,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Score, ScoreSourceType } from "../entities/score.ts"

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
  readonly hasSignal: boolean
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
  readonly hasSignal: boolean
  readonly sources: readonly string[]
}

/** Signal occurrence aggregate for issue lifecycle. */
export interface SignalOccurrenceAggregate {
  readonly signalId: SignalId
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
export interface SignalEscalationSignals {
  readonly signalId: SignalId
  readonly recent1h: number
  readonly recent6h: number
  readonly recent24h: number
  readonly expected1h: number
  readonly expected6hPerHour: number
  readonly stddev1h: number
  readonly stddev6hPerHour: number
  readonly samplesCount: number
}

/**
 * Lifetime impact rollup for one issue. Occurrences/traces/sessions come from
 * `scores`; cost/tokens are summed over the issue's distinct affected traces
 * (`traces`); `affectedUsers` is the count of distinct non-empty users on the
 * sessions those occurrences belong to (`sessions`). Occurrences without a
 * session (or sessions without a resolved user) do not contribute to
 * `affectedUsers`/`affectedSessions`.
 */
export interface SignalImpactAggregate {
  readonly signalId: SignalId
  readonly occurrences: number
  readonly affectedTraces: number
  readonly affectedSessions: number
  readonly affectedUsers: number
  readonly costMicrocents: number
  readonly tokens: number
}

/**
 * A telemetry dimension whose values can be tested for association with an
 * issue. Each is read from a span field and rolled up to the trace: `model` →
 * `model`, `provider` → `provider`, `tool` → `tool_name`, `tag` → flattened
 * `tags`, `finishReason` → flattened `finish_reasons`. A trace "carries" a
 * value if any of its spans has it.
 */
export type SignalDimension = "model" | "provider" | "tool" | "tag" | "finishReason"

/**
 * One value of a dimension under **reverse** conditioning: of the traces that
 * carry this value, the share that fall into the issue (`conditionalRate =
 * P(issue | value)`), compared elsewhere against the issue's unconditional base
 * rate. Counts are distinct traces, not spans.
 *
 * The two-direction trade-off (this reverse form vs. the forward `P(value |
 * issue)`) is documented at length in `specs/issue-details-page.md` (Data model
 * method #2); reverse was chosen for stable, directly-readable rates and an
 * intuitive support gate.
 */
export interface DimensionConditionalRate {
  readonly value: string
  /** Distinct traces carrying this value that are in the issue. */
  readonly affectedTraces: number
  /** Distinct project traces carrying this value (the conditional-rate denominator / support). */
  readonly totalTraces: number
  /** `affectedTraces / totalTraces` = `P(issue | value)`, in `[0, 1]`. */
  readonly conditionalRate: number
  /** `affectedTraces / signalAffectedTraces` = share of the issue this value explains, in `[0, 1]`. */
  readonly coverage: number
}

/**
 * Reverse-conditioned comparison of one dimension for one issue. `baseRate` is
 * the issue's unconditional trace incidence (`signalAffectedTraces /
 * totalProjectTraces`) — the reference each value's `conditionalRate` is judged
 * against, and the same number the impact strip reports as affected-traces %.
 * The repository returns every non-empty value; support gating and
 * rate-elevation ranking live in `@domain/signals`.
 */
export interface SignalDimensionComparison {
  readonly dimension: SignalDimension
  readonly baseRate: number
  readonly signalAffectedTraces: number
  readonly values: readonly DimensionConditionalRate[]
}

/**
 * One co-occurrence candidate for the Related-issues list: another issue that
 * has occurrences in at least one of the source issue's sessions (in range).
 * Raw session counts only — NPMI scoring, the shared-session floor, and
 * ranking live in `@domain/signals` so the math is unit-testable without
 * ClickHouse.
 */
export interface SignalCoOccurrence {
  readonly signalId: SignalId
  /** Sessions where both the source issue and this issue have an occurrence. */
  readonly sharedSessions: number
  /** Sessions where this issue has an occurrence. */
  readonly theirSessions: number
}

/**
 * Session co-occurrence counts for one issue. The probability universe
 * (`totalSessions`) is **sessions carrying at least one issue occurrence** —
 * not all project sessions: unscored sessions carry no information about
 * issue association and would only dilute every probability uniformly.
 */
export interface SignalCoOccurrenceAggregate {
  /** Sessions where the source issue has an occurrence (in range). */
  readonly mySessions: number
  /** Sessions with any issue occurrence (in range) — the probability universe. */
  readonly totalSessions: number
  /** Top candidates by shared sessions, self-excluded, `sharedSessions ≥ 1`. */
  readonly candidates: readonly SignalCoOccurrence[]
}

/** A single time-bucket for issue occurrence time-series. */
export interface SignalOccurrenceBucket {
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
 * `bucket` matches the corresponding `SignalOccurrenceBucket.bucket` key
 * 1:1 so the consumer can zip the two arrays without re-keying.
 */
export interface SignalEscalationThresholdBucket {
  readonly bucket: string
  readonly thresholdCount: number
}

/** Grouped per-issue threshold result for batched chart reads. */
export interface SignalEscalationThresholdSeries {
  readonly signalId: SignalId
  readonly buckets: readonly SignalEscalationThresholdBucket[]
}

/** Time range applied to score.created_at analytics reads. */
export interface ScoreAnalyticsTimeRange {
  readonly from?: Date
  readonly to?: Date
}

/** Per-issue occurrence rollup inside a selected score window. */
export interface SignalWindowMetric {
  readonly signalId: SignalId
  readonly occurrences: number
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
}

/** Per-issue rollup of tags across all traces affected by the issue. */
export interface SignalTagsAggregate {
  readonly signalId: SignalId
  readonly tags: readonly string[]
}

/**
 * Time range used when aggregating issue tags. A lower bound is required
 * (not just allowed) so the CH scans on `scores` and `traces` always have a
 * partition-pruning predicate — see `aggregateTagsBySignals` for context.
 */
export interface SignalTagsTimeRange {
  readonly from: Date
  readonly to?: Date
}

/** Grouped issue trend result for batched chart reads. */
export interface SignalTrendSeries {
  readonly signalId: SignalId
  readonly buckets: readonly SignalOccurrenceBucket[]
}

/** Distinct trace scoped to one issue, ordered by last seen timestamp. */
export interface SignalTraceSummary {
  readonly traceId: TraceId
  readonly lastSeenAt: Date
}

/** Paginated distinct traces for an issue. */
export interface SignalTracePage {
  readonly items: readonly SignalTraceSummary[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

/** Per-issue rollup of the scores recorded within a single session. */
export interface SessionSignalRollup {
  readonly signalId: SignalId
  readonly occurrences: number
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  /** Distinct traces in the session that contributed a score to this issue. */
  readonly traceIds: readonly TraceId[]
}

/** Per-issue rollup of the scores recorded on one end-user's traces. */
export interface UserSignalRollup {
  readonly signalId: SignalId
  readonly occurrences: number
  /** Distinct traces of the user that contributed a score to this issue. */
  readonly affectedTraces: number
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
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
    readonly source: ScoreSourceType
    readonly sourceId: string
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<ScoreAggregate, RepositoryError, ChSqlClient>

  // -- Source trend (time-series) --------------------------------------------
  trendBySource(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly source: ScoreSourceType
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

  // -- Signal occurrence aggregates for lifecycle -----------------------------
  aggregateBySignals(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SignalOccurrenceAggregate[], RepositoryError, ChSqlClient>

  // -- Per-issue lifetime impact rollup (occurrences, reach, cost) -----------
  // Occurrences/traces/sessions read from `scores`; cost/tokens summed over the
  // issue's distinct affected traces (`traces`); users resolved from the
  // `sessions` MV. All metrics are lifetime (no time-range bound), matching
  // `aggregateBySignals`.
  aggregateImpactBySignal(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<SignalImpactAggregate, RepositoryError, ChSqlClient>

  // -- Per-issue dimension comparison (reverse conditioning) -----------------
  // For each value of `dimension`, computes the share of the project traces
  // carrying that value which fall into the issue (`P(issue | value)`), plus the
  // issue's unconditional base rate (`P(issue)`). Trace-level distinct counting;
  // the empty value is excluded. Support gating + ranking live in `@domain/signals`.
  aggregateDimensionBySignal(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly dimension: SignalDimension
    readonly timeRange?: ScoreAnalyticsTimeRange
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<SignalDimensionComparison, RepositoryError, ChSqlClient>

  // -- Per-issue session co-occurrence (Related-issues signal) ---------------
  // One scan over issue-carrying `scores` in `timeRange`: the source issue's
  // distinct session set, then GROUP BY issue_id counting shared vs. total
  // sessions per candidate, self-excluded. Scoreless sessions are outside the
  // universe by construction (see `SignalCoOccurrenceAggregate`).
  coOccurrenceBySignal(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly timeRange: ScoreAnalyticsTimeRange
    readonly limit?: number // default 25 candidates
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<SignalCoOccurrenceAggregate, RepositoryError, ChSqlClient>

  // -- Per-issue signals for the seasonal-anomaly escalation detector --------
  // Reads:
  //   • sliding 1h / 6h / 24h counts from raw `scores` (small scan, PK lookup)
  //   • pooled (dow, hour ± 1) × prior weeks expected/stddev from the
  //     `scores_hourly_buckets` materialized view (constant cost regardless of
  //     score volume).
  // The repository never applies the σ floor or the cold-start `k` inflation —
  // those rules live in the `evaluateSeasonalEscalation` helper so the data
  // returned here is the raw observation.
  escalationSignalsBySignals(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
    readonly now?: Date // overridable for tests; defaults to now() inside the query
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SignalEscalationSignals[], RepositoryError, ChSqlClient>

  // -- Signal tag aggregation across affected traces --------------------------
  // `timeRange.from` is required to keep the underlying scans partition-bounded
  // (see implementation comment for context). `to` defaults to "now".
  aggregateTagsBySignals(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
    readonly timeRange: SignalTagsTimeRange
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SignalTagsAggregate[], RepositoryError, ChSqlClient>

  // -- Signal occurrence time-series ------------------------------------------
  /**
   * Per-issue trend over the last `days` (default 30) bucketed by `bucketSeconds`. Bucket keys
   * are emitted as ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS.000Z`) regardless of interval —
   * the consumer is responsible for any shorter-form formatting in the UI.
   */
  trendBySignal(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly days?: number // default 30
    readonly bucketSeconds: number
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SignalOccurrenceBucket[], RepositoryError, ChSqlClient>
  listSignalWindowMetrics(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly filters?: FilterSet
    readonly timeRange?: ScoreAnalyticsTimeRange
    readonly signalIds?: readonly SignalId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SignalWindowMetric[], RepositoryError, ChSqlClient>
  /**
   * Project-wide issue-occurrence histogram bucketed by `bucketSeconds`. Bucket keys are emitted
   * as ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS.000Z`) regardless of interval.
   */
  histogramBySignals(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
    readonly filters?: FilterSet
    readonly timeRange: ScoreAnalyticsTimeRange
    readonly bucketSeconds: number
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SignalOccurrenceBucket[], RepositoryError, ChSqlClient>
  trendBySignals(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
    readonly filters?: FilterSet
    readonly timeRange: ScoreAnalyticsTimeRange
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SignalTrendSeries[], RepositoryError, ChSqlClient>
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
  escalationThresholdHistogramBySignals(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalIds: readonly SignalId[]
    readonly timeRange: ScoreAnalyticsTimeRange
    readonly bucketSeconds: number
    readonly kShort: number
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SignalEscalationThresholdSeries[], RepositoryError, ChSqlClient>
  countDistinctTracesByTimeRange(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly timeRange?: ScoreAnalyticsTimeRange
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<number, RepositoryError, ChSqlClient>
  listTracesBySignal(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly limit?: number
    readonly offset?: number
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<SignalTracePage, RepositoryError, ChSqlClient>
  countTracesBySignal(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly signalId: SignalId
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<number, RepositoryError, ChSqlClient>
  /**
   * Per-issue rollup of the scores recorded across a set of traces — the
   * reverse of `listTracesBySignal`. Drives the session panel's Signals tab,
   * scoped to the session's `traceIds`. Scoping by `trace_id` (not
   * `session_id`) is deliberate: orphan sessions synthesize their id from the
   * trace id in the sessions MV, but the raw `scores` rows carry no
   * `session_id`, so a `session_id` filter would miss them entirely. Every
   * score reliably carries a `trace_id`. `issue_id` is `''` when a score isn't
   * tied to an issue, so those rows are excluded. Ordered by `lastSeenAt` desc.
   */
  listSignalsByTraceIds(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly SessionSignalRollup[], RepositoryError, ChSqlClient>
  /**
   * Per-issue rollup of the scores recorded across one end-user's traces —
   * `listSignalsByTraceIds` with the trace set resolved inside ClickHouse from
   * the `traces` MV's finalized `user_id` (scores carry no user column).
   * Scoping by `trace_id` rather than `session_id` for the same reason as
   * `listSignalsByTraceIds`. Ordered by `lastSeenAt` desc.
   */
  listSignalsByUser(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly userId: ExternalUserId
    readonly limit?: number
    readonly options?: ScoreAnalyticsOptions
  }): Effect.Effect<readonly UserSignalRollup[], RepositoryError, ChSqlClient>
}

export class ScoreAnalyticsRepository extends Context.Service<
  ScoreAnalyticsRepository,
  ScoreAnalyticsRepositoryShape
>()("@domain/scores/ScoreAnalyticsRepository") {}
