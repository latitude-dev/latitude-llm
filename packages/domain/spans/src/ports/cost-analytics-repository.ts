import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CostSource } from "../entities/span.ts"
import type { SessionCostPeriod } from "../helpers/decompose-cost-per-session.ts"

/**
 * Repository port for cost analytics (ClickHouse spans table).
 *
 * Every figure here is scoped to spans whose `operation` is billable (the same
 * allowlist the traces/sessions rollups use), so wrapper and tool spans never
 * dilute a per-trace average or double-count spend.
 *
 * Costs are microcents throughout (1 USD = 100,000,000 microcents) — the column
 * unit, kept intact so the display layer owns rounding.
 */
export interface CostAnalyticsRepositoryShape {
  /**
   * Window-level spend figures plus the two data-confidence measures, in one
   * query. Read as a whole: `totalMicrocents` is only as trustworthy as
   * `verifiedMicrocents` and `unpricedTokens` say it is.
   */
  getCostOverview(input: CostAnalyticsScope): Effect.Effect<CostOverview, RepositoryError, ChSqlClient>

  /**
   * Spend per time bucket. `total` sums spend and is additionally broken down
   * by model so the chart can stack; `average` and `p95` summarise the
   * distribution of per-trace cost within each bucket and carry no breakdown.
   */
  getCostSeries(
    input: CostAnalyticsScope & { readonly metric: CostSeriesMetric; readonly bucketSeconds: number },
  ): Effect.Effect<readonly CostSeriesBucket[], RepositoryError, ChSqlClient>

  /**
   * Every cost measure the breakdown table shows, per value of one dimension, in
   * one query rather than one round trip per column. The generic analytics
   * operation returns a single metric per call, which this table cannot use.
   */
  getCostBreakdown(
    input: CostAnalyticsScope & { readonly dimension: CostBreakdownDimension },
  ): Effect.Effect<CostBreakdown, RepositoryError, ChSqlClient>

  /**
   * Cost *and* tokens per model per bucket from one scan, so the chart's
   * measure toggle costs no second request and cannot reshuffle its own legend.
   */
  getModelUsageSeries(
    input: CostAnalyticsScope & { readonly bucketSeconds: number },
  ): Effect.Effect<ModelUsageSeries, RepositoryError, ChSqlClient>

  /**
   * Cache token flow per model, the measured half of cache economics, plus the
   * arrival cadence the achievable ceiling is read from. Rates are exact — every
   * figure is a token count — while the break-even and the lifetime they are judged
   * against come from the pricing registry, not from here.
   *
   * Cadence comes back as a cumulative histogram over `CACHE_CEILING_LIFETIME_SECONDS`
   * rather than one row per lifetime: the query cannot reach the registry to learn
   * which lifetime a row should use, and a caller that can explore several must not
   * pay a round trip per lifetime.
   */
  getCacheEconomics(input: CostAnalyticsScope): Effect.Effect<CacheEconomics, RepositoryError, ChSqlClient>

  /**
   * The counts behind cost per session for two adjacent windows, so the log-space
   * decomposition can be computed from one scan rather than from two round trips
   * that could disagree about their filters.
   */
  getSessionCostFactors(
    input: SessionCostFactorsScope,
  ): Effect.Effect<SessionCostFactorsPair, RepositoryError, ChSqlClient>

  /**
   * Spend on traces that failed, and what they failed on.
   *
   * The only figure in this port that names money which bought *nothing*, so it is
   * whole-trace by construction: see `WastedSpend`.
   */
  getWastedSpend(input: CostAnalyticsScope): Effect.Effect<WastedSpend, RepositoryError, ChSqlClient>
}

export interface CostAnalyticsScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Inclusive lower bound on `start_time`. */
  readonly from: Date
  /** Exclusive upper bound. */
  readonly to: Date
}

export const COST_SERIES_METRICS = ["total", "average", "p95"] as const
export type CostSeriesMetric = (typeof COST_SERIES_METRICS)[number]

/**
 * `total` is additive, so a bar's area is meaningful and `byModel` lets it
 * stack. `average` and `p95` are distribution summaries that do not accumulate
 * across buckets, so they render as a line and leave `byModel` empty.
 */
export interface CostSeriesBucket {
  readonly bucketStart: Date
  readonly valueMicrocents: number
  /** Per-model split of `valueMicrocents`; empty for non-additive metrics. */
  readonly byModel: readonly CostSeriesModelSlice[]
}

export interface CostSeriesModelSlice {
  readonly model: string
  readonly costMicrocents: number
}

export interface CostOverview {
  readonly totalMicrocents: number
  /**
   * Traces with at least one billable span. This is the denominator for every
   * per-trace figure — traces made up entirely of tool or wrapper spans are
   * excluded so they cannot deflate the average.
   */
  readonly tracesWithUsage: number
  readonly avgPerTraceMicrocents: number
  /** Highest total spend in the window, not highest unit price. Null when no model spent anything. */
  readonly topSpendModel: CostModelSpend | null
  readonly confidence: CostConfidence
}

/** All four are plain span columns, so no dimension costs more than another to group by. */
export const COST_BREAKDOWN_DIMENSIONS = ["model", "provider", "operation", "service"] as const
export type CostBreakdownDimension = (typeof COST_BREAKDOWN_DIMENSIONS)[number]

/**
 * Rows returned per dimension. Beyond this the table stops being read and starts
 * being searched; `distinctValues` tells the caller how much was left off.
 */
export const COST_BREAKDOWN_ROW_LIMIT = 25

/**
 * The measures shared by a breakdown row and the window totals it is a share of,
 * so a row can always be divided by the total it belongs to.
 *
 * `cacheAndOtherMicrocents` is `total - input - output` and is not decoration:
 * provider-reported cost folds cache read/write into the input side and some
 * providers return a non-additive total, so the two named sides do not close.
 */
export interface CostBreakdownUsage {
  readonly totalMicrocents: number
  readonly inputMicrocents: number
  readonly outputMicrocents: number
  readonly cacheAndOtherMicrocents: number
  readonly calls: number
  readonly tokens: number
  /** Usage ingestion could not price, so this row's total is understated by whatever it would have cost. */
  readonly unpricedTokens: number
  readonly unpricedCalls: number
  /** Zero-cost usage stored before `costSource` existed, which cannot say whether it was free or unpriced. */
  readonly unknownTokens: number
  readonly unknownCalls: number
}

export interface CostBreakdownRow extends CostBreakdownUsage {
  /** The dimension's value; empty when the span did not record one. */
  readonly key: string
  /** Traces containing this value — a trace can hit several, so these do not sum to `tracesWithUsage`. */
  readonly tracesWithValue: number
  readonly avgPerTraceMicrocents: number
}

/**
 * Minimum calls behind a cost-per-call figure before it may be compared to the
 * window average. Below this the ratio is a one-sample artefact: a single expensive
 * call reads as a `278x` finding, the loudest figure on the panel and the least true.
 */
export const COST_PER_CALL_MIN_SAMPLE_CALLS = 20

export interface CostBreakdownTotals extends CostBreakdownUsage {
  readonly tracesWithUsage: number
  /** The baseline a row's own cost per call is a multiple of. */
  readonly avgPerCallMicrocents: number
  /** Distinct values in the window, so a caller can tell whether `rows` was truncated. */
  readonly distinctValues: number
}

export interface CostBreakdown {
  /** Highest spend first, capped at `COST_BREAKDOWN_ROW_LIMIT`. */
  readonly rows: readonly CostBreakdownRow[]
  /** Window-wide, so shares stay honest even when `rows` is truncated. */
  readonly totals: CostBreakdownTotals
}

/**
 * Models charted individually. Past this the palette runs out of distinguishable
 * hues and the legend becomes a lookup table, so the rest collapse into `other`.
 */
export const MODEL_USAGE_SERIES_LIMIT = 6

export interface ModelUsageMeasures {
  readonly costMicrocents: number
  readonly tokens: number
}

export interface ModelUsageSlice extends ModelUsageMeasures {
  readonly model: string
}

export interface ModelUsageBucket {
  readonly bucketStart: Date
  /** Only the ranked models, and only where they recorded a span; absent means zero. */
  readonly byModel: readonly ModelUsageSlice[]
  readonly other: ModelUsageMeasures
}

export interface ModelUsageSeries {
  readonly buckets: readonly ModelUsageBucket[]
  /**
   * Ranked by spend in the window, not by call count: on a cost chart, ranking by
   * volume crowds out the expensive model that is the story. Both measures share
   * this ranking so toggling between them never reshuffles the legend.
   */
  readonly models: readonly string[]
  /** Distinct models folded into every bucket's `other`, so the legend can name how many. */
  readonly otherModels: number
}

/**
 * Models listed in the cache table. Beyond this the comparison stops being one,
 * and `distinctModels` says how many were left off.
 */
export const CACHE_ECONOMICS_ROW_LIMIT = 25

/**
 * Token counts, never dollars: provider-reported cache spend is folded into
 * `cost_input_microcents` and cannot be recovered by subtraction, so a cache
 * dollar figure would have to be modeled. `costMicrocents` is the row's
 * authoritative total spend, which is what makes a row worth reading at all.
 */
export interface CacheUsageMeasures {
  readonly calls: number
  /** Uncached input tokens only; the three input-side counts are additive. */
  readonly inputTokens: number
  readonly cacheReadTokens: number
  readonly cacheCreateTokens: number
  readonly costMicrocents: number
  /** Usage ingestion could not price, so this row's spend is understated. */
  readonly unpricedCalls: number
  readonly unpricedTokens: number
}

export interface CacheModelUsage extends CacheUsageMeasures {
  readonly model: string
  readonly provider: string
}

/**
 * How much of a model's cache-eligible volume arrived close enough behind another
 * call to have found a warm entry, measured against one candidate cache lifetime.
 *
 * The gap is taken between consecutive calls to the same *agent* on the same model,
 * across that agent's whole traffic and never within a session: a cache read does not
 * care which conversation wrote the entry, so two unrelated users hitting an agent ten
 * seconds apart are exactly as reusable as two turns of one conversation. Measuring
 * within-session gaps would score a high-volume single-turn workload — a classification
 * pipeline, a RAG endpoint, a one-exchange support bot on a shared system prompt — as
 * unfixable when it is the ideal caching case.
 *
 * Volume is the whole prompt per call. The 1,024-token floor below which providers
 * decline to cache at all is not applied here: it is a property of the model's
 * configuration rather than of its cadence, and the classifier already holds it.
 */
export interface CacheCadenceRow {
  readonly provider: string
  readonly model: string
  readonly cacheableTokens: number
  readonly calls: number
  /**
   * Cumulative warm volume keyed by lifetime in seconds: the entry for 300 contains
   * everything already warm at 60. One entry per `CACHE_CEILING_LIFETIME_SECONDS`.
   */
  readonly warmTokensByLifetime: Readonly<Record<number, number>>
  readonly warmCallsByLifetime: Readonly<Record<number, number>>
}

export interface CacheEconomics {
  /**
   * One row per provider/model pair, highest spend first, capped at
   * `CACHE_ECONOMICS_ROW_LIMIT`. Split by provider because break-even is a
   * property of the price list, and the same model slug served by two providers
   * is two different price lists.
   */
  readonly rows: readonly CacheModelUsage[]
  /**
   * One row per provider/model pair. Not capped alongside `rows`: a pair present here
   * but not there simply has no ceiling to show.
   */
  readonly cadence: readonly CacheCadenceRow[]
  readonly totals: CacheUsageMeasures & { readonly distinctModels: number }
}

/**
 * `from`/`to` bound the current window; `previousFrom` opens the comparison window
 * that runs up to `from`. The caller sets the two lengths equal — the repository
 * only reads the bounds it is given.
 */
export interface SessionCostFactorsScope extends CostAnalyticsScope {
  readonly previousFrom: Date
  /** Bucket width for the headline sparklines, which span both windows. */
  readonly bucketSeconds: number
}

/**
 * One sparkline point. Only the two headline measures: a session count is a clean
 * series, whereas a per-bucket ratio of two small counts swings on volume alone and
 * would read as an event rather than as noise.
 */
export interface SessionCostBucket {
  readonly bucketStart: Date
  readonly sessions: number
  readonly costMicrocents: number
}

export interface SessionCostFactorsPair {
  readonly previous: SessionCostPeriod
  readonly current: SessionCostPeriod
  /** Both windows, oldest first. */
  readonly buckets: readonly SessionCostBucket[]
}

/**
 * Failure reasons listed on the wasted-spend panel. Beyond this the list stops being a
 * ranking, and the remainder is exact because every errored trace lands in exactly one
 * reason — see `WastedSpendReason`.
 */
export const WASTED_SPEND_REASON_LIMIT = 6

/**
 * Minimum traces with billable usage before wasted spend may be shown as a *share* of
 * the window. The dollar figure needs no floor — it is a sum, true at any volume — but a
 * percentage over a handful of traces swings between 0% and 100% on one failure.
 */
export const WASTED_SPEND_MIN_SAMPLE_TRACES = 20

/**
 * One failure reason and the spend behind it.
 *
 * A trace is attributed to the `error_type` of its *first* failed span, so the reasons
 * partition the errored traces: their costs sum to `erroredCostMicrocents` exactly, which
 * a trace counted under every error type it hit could not do.
 */
export interface WastedSpendReason {
  /** Empty when the failing span recorded no `error.type` attribute. */
  readonly errorType: string
  readonly traces: number
  readonly costMicrocents: number
}

/**
 * Spend on traces that errored, against the window they sit in.
 *
 * **Whole-trace, deliberately.** A failed call usually records no usage at all — the
 * provider rejected it — so the money in a failed trace was spent on the steps that
 * *succeeded* and whose output was then thrown away. Charging only the failed span would
 * report ~$0 for exactly the traces that wasted the most.
 *
 * Errored means at least one span with `status_code = 2`, the same definition the traces
 * list's Status filter uses, so the panel's drill-down returns the traces it counted.
 */
export interface WastedSpend {
  readonly erroredTraces: number
  readonly erroredCostMicrocents: number
  /** Denominator for the share: traces with at least one billable span, errored or not. */
  readonly tracesWithUsage: number
  readonly totalMicrocents: number
  /** On errored traces only. Both feed the shared rollup cost display. */
  readonly erroredUnpricedCalls: number
  readonly erroredTokens: number
  /** Highest spend first, capped at `WASTED_SPEND_REASON_LIMIT`. */
  readonly reasons: readonly WastedSpendReason[]
  /** Distinct reasons in the window, so a caller can tell whether `reasons` was truncated. */
  readonly distinctErrorTypes: number
}

export interface CostModelSpend {
  readonly model: string
  readonly provider: string
  readonly costMicrocents: number
}

/**
 * How much of the window's spend we can stand behind, read from each span's
 * `costSource` rather than inferred from a zero.
 *
 * `verifiedMicrocents` is spend the provider reported; the remainder is priced
 * by Latitude from token counts. In practice almost nothing is provider-reported,
 * so that split states the *method* and does not move — the figure that moves,
 * and the one worth showing as a share, is priced coverage: `billableTokens`
 * minus the tokens behind the classified gap pairs below.
 */
export interface CostConfidence {
  readonly verifiedMicrocents: number
  readonly estimatedMicrocents: number
  /** Denominator for priced coverage: all tokens on billable spans in the window. */
  readonly billableTokens: number
  /**
   * Usage ingestion recorded as `unpriced`: tokens that contributed nothing to
   * `totalMicrocents`, so the window's spend is understated by whatever they
   * would have cost. A decided pricing gap, not a guess about a zero.
   */
  readonly unpricedTokens: number
  readonly unpricedCalls: number
  /**
   * Zero-cost usage stored before `costSource` existed. Such a row cannot say
   * whether it was free or unpriced, so it is neither counted as a gap nor
   * waved through: while this is non-zero, priced coverage is a lower bound.
   */
  readonly unknownTokens: number
  readonly unknownCalls: number
  /**
   * Provider/model pairs behind both buckets, largest first.
   *
   * Still classify these through `getCostSpec` before presenting a figure. What
   * the registry says *now* is what makes a gap actionable: a pair ingestion
   * marked `unpriced` that prices today is a repairable ingest gap, while one
   * that prices at zero was always free and must not be reported as missing.
   */
  readonly zeroCostPairs: readonly CostZeroCostPair[]
}

export interface CostZeroCostPair {
  readonly provider: string
  readonly model: string
  readonly tokens: number
  readonly calls: number
  /** Whether ingestion decided this was unpriced, or the row predates `costSource`. */
  readonly source: Extract<CostSource, "unpriced" | "unknown">
}

export class CostAnalyticsRepository extends Context.Service<CostAnalyticsRepository, CostAnalyticsRepositoryShape>()(
  "@domain/spans/CostAnalyticsRepository",
) {}
