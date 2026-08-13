/**
 * Which builder a garden run persists. Resolved from the per-organization
 * `adaptiveTaxonomyClustering` feature flag alone, so flipping the flag takes
 * effect on that organization's next garden pass and reverts just as fast: every
 * pass reads the flag afresh and rebuilds the whole tree from the current window.
 *
 * The flag is read in the activity layer only — this module is pure so the mode it
 * produces can be threaded through the planning use case and the build request.
 */

import type { TAXONOMY_ADAPTIVE_CLUSTERING_MODES } from "./constants.ts"

export type TaxonomyAdaptiveClusteringMode = (typeof TAXONOMY_ADAPTIVE_CLUSTERING_MODES)[number]

export const TAXONOMY_ADAPTIVE_CLUSTERING_MODE_DEFAULT: TaxonomyAdaptiveClusteringMode = "off"

/** `off` persists the static tree unchanged; `enforced` persists the adaptive one. */
export const isAdaptiveModeActive = (mode: TaxonomyAdaptiveClusteringMode): boolean => mode !== "off"
