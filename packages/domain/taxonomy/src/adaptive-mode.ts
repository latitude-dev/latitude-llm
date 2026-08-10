/**
 * Which builder a garden run persists, resolved from two inputs:
 *
 *   - the environment baseline (`LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE`), the
 *     kill switch for the whole deploy;
 *   - the per-organization `adaptiveTaxonomyClustering` feature flag, the switch
 *     that selects the adaptive builder for that organization.
 *
 * The flag alone decides between the two builders, so flipping it takes effect on
 * the organization's next garden pass and reverts just as fast: every pass reads
 * the flag afresh and rebuilds the whole tree from the current window. `off`
 * always wins so the env stays a guaranteed global no-op. Both inputs are read in
 * the activity layer only — this module is pure so it can be unit-tested and
 * called from the planning activity.
 */

import { TAXONOMY_ADAPTIVE_CLUSTERING_MODES } from "./constants.ts"

export type TaxonomyAdaptiveClusteringMode = (typeof TAXONOMY_ADAPTIVE_CLUSTERING_MODES)[number]

export const TAXONOMY_ADAPTIVE_CLUSTERING_MODE_DEFAULT: TaxonomyAdaptiveClusteringMode = "off"

/** Anything not exactly `off`/`enforced` falls back to the safe `off` default. */
export const parseTaxonomyAdaptiveModeBaseline = (raw: string | undefined): TaxonomyAdaptiveClusteringMode =>
  (TAXONOMY_ADAPTIVE_CLUSTERING_MODES as readonly string[]).includes(raw ?? "")
    ? (raw as TaxonomyAdaptiveClusteringMode)
    : TAXONOMY_ADAPTIVE_CLUSTERING_MODE_DEFAULT

export const resolveTaxonomyAdaptiveMode = (input: {
  readonly envBaseline: TaxonomyAdaptiveClusteringMode
  readonly flagEnabledForOrg: boolean
}): TaxonomyAdaptiveClusteringMode => (input.envBaseline === "off" || !input.flagEnabledForOrg ? "off" : "enforced")

/** `off` persists the static tree unchanged; `enforced` persists the adaptive one. */
export const isAdaptiveModeActive = (mode: TaxonomyAdaptiveClusteringMode): boolean => mode !== "off"
