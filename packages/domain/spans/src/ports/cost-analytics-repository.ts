import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

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
  /** Highest total spend in the window, not highest unit price. Null when the window is empty. */
  readonly topSpendModel: CostModelSpend | null
  readonly confidence: CostConfidence
}

export interface CostModelSpend {
  readonly model: string
  readonly provider: string
  readonly costMicrocents: number
}

/**
 * How much of the window's spend we can stand behind.
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
   * Tokens on spans carrying no cost, which contribute nothing to
   * `totalMicrocents` — the window's spend is understated by whatever they
   * would have cost.
   *
   * These are *candidates*, not confirmed pricing gaps: SQL cannot tell a
   * missing price from a legitimately free model (a `:free` variant or a
   * customer's own model both correctly cost nothing). The pricing registry is
   * the only authority, so callers classify `candidatePairs` through
   * `getCostSpec` before presenting a number — otherwise the figure cries wolf.
   */
  readonly unpricedCandidateTokens: number
  readonly unpricedCandidateTraces: number
  /** The provider/model pairs behind the candidate tokens, largest first. */
  readonly unpricedCandidatePairs: readonly CostUnpricedPair[]
}

export interface CostUnpricedPair {
  readonly provider: string
  readonly model: string
  readonly tokens: number
  readonly calls: number
}

export class CostAnalyticsRepository extends Context.Service<CostAnalyticsRepository, CostAnalyticsRepositoryShape>()(
  "@domain/spans/CostAnalyticsRepository",
) {}
