import type { ExperimentMetricKey } from "../constants.ts"
import type { Experiment } from "./experiment.ts"

/** The resolved absolute window a variant's `timeRange` was computed over. */
export interface ResolvedRange {
  readonly fromIso: string
  readonly toIso: string
}

/** One ranked entry in a per-entity top-N list (top tools / signals / behaviours). */
export interface TopListItem {
  /** Stable identity (tool name, signal id, cluster id). */
  readonly key: string
  /** Human-readable label to render. */
  readonly label: string
  /** The ranking value (calls / occurrences / observations). */
  readonly value: number
}

/** Scalar metric value per catalog key (`null` when empty/not computable), plus per-entity top lists. */
export interface VariantMetrics {
  readonly values: Readonly<Record<ExperimentMetricKey, number | null>>
  readonly topTools: readonly TopListItem[]
  readonly topSignals: readonly TopListItem[]
  readonly topBehaviours: readonly TopListItem[]
}

/**
 * A metric's change vs the baseline: the signed fraction `(value - baseline) / baseline`, or
 * `"up-from-zero"` when the baseline was `0` but the variant isn't (an unbounded increase that has
 * no finite percentage). `null` when incomparable (baseline itself, or a `null`/`0`→`0` value).
 */
export type MetricDeltaValue = number | "up-from-zero"

/**
 * A variant's metrics plus its comparison to the baseline. `deltas` is the per-key change vs the
 * baseline value (see `MetricDeltaValue`).
 */
export interface VariantComparison {
  readonly variantId: string
  readonly baseline: boolean
  /** `true` when the variant's search query has a semantic component, so its population is best-effort. */
  readonly approximate: boolean
  readonly resolvedRange: ResolvedRange
  readonly metrics: VariantMetrics
  readonly deltas: Readonly<Record<ExperimentMetricKey, MetricDeltaValue | null>>
  /** Population metric keys (a subset of `sessions.count` / `sessions.users`) that individually deviate from the baseline by more than the deviation threshold. */
  readonly deviatingPopulationKeys: readonly ExperimentMetricKey[]
}

/** The full comparison payload for the detail view and `GET /{experimentSlug}`. */
export interface ExperimentComparison {
  readonly experiment: Experiment
  readonly variants: readonly VariantComparison[]
}

/** Cheap aggregate metrics for one experiment's list row (distinct unions across all its variants). */
export interface ExperimentSummaryMetrics {
  readonly experimentId: string
  readonly sessionsDistinct: number
  readonly usersDistinct: number
}
