/**
 * Rollout-mode resolution for the adaptive divisive build.
 *
 * The mode is resolved from two inputs so a whole environment can be shadowed
 * while only chosen organizations are enforced:
 *
 *   - the environment baseline (`LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE`), the
 *     kill switch and shadow toggle for the whole deploy;
 *   - the per-organization `adaptiveTaxonomyClustering` feature flag, which can
 *     only raise the baseline to `enforced` (added in Phase 4 / LAT-773; passed
 *     as `false` until then).
 *
 * `off` always wins so it stays a guaranteed global no-op, and the flag never
 * lowers the mode. Both inputs are read in the activity layer only — this module
 * is pure so it can be unit-tested and called from the planning activity.
 */

import { TAXONOMY_ADAPTIVE_CLUSTERING_MODES } from "./constants.ts"

export type TaxonomyAdaptiveClusteringMode = (typeof TAXONOMY_ADAPTIVE_CLUSTERING_MODES)[number]

export const TAXONOMY_ADAPTIVE_CLUSTERING_MODE_DEFAULT: TaxonomyAdaptiveClusteringMode = "off"

/** Anything not exactly `off`/`shadow`/`enforced` falls back to the safe `off` default. */
export const parseTaxonomyAdaptiveModeBaseline = (raw: string | undefined): TaxonomyAdaptiveClusteringMode =>
  (TAXONOMY_ADAPTIVE_CLUSTERING_MODES as readonly string[]).includes(raw ?? "")
    ? (raw as TaxonomyAdaptiveClusteringMode)
    : TAXONOMY_ADAPTIVE_CLUSTERING_MODE_DEFAULT

export const resolveTaxonomyAdaptiveMode = (input: {
  readonly envBaseline: TaxonomyAdaptiveClusteringMode
  readonly flagEnabledForOrg: boolean
}): TaxonomyAdaptiveClusteringMode => {
  if (input.envBaseline === "off") return "off"
  if (input.flagEnabledForOrg) return "enforced"
  return input.envBaseline
}

/** `off` persists the static tree unchanged; every other mode runs the new machinery. */
export const isAdaptiveModeActive = (mode: TaxonomyAdaptiveClusteringMode): boolean => mode !== "off"
