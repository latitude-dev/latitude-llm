import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CostSource } from "../entities/span.ts"

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
