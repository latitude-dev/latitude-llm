/**
 * Full-window reassignment routing.
 *
 * The adaptive publish path stages the whole new tree, then routes the *complete*
 * bounded live window (not just the ≤1,500 clustering sample) to the staging
 * leaves before the atomic swap, so no active read is left pointing at a
 * soon-to-deprecate cluster. Routing is a fit-floor-gated argmax over the LEAF
 * centroids: the leaves partition the space, so nearest-leaf matches the deepest-fit
 * descent that built them, and it is deterministic for Temporal replay.
 */

import type { TaxonomyClusterId } from "@domain/shared"
import { TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD } from "./constants.ts"
import { cosineSimilarityNormalized, normalizeTaxonomyEmbedding } from "./helpers.ts"

export interface ReassignmentLeaf {
  readonly clusterId: TaxonomyClusterId
  /** Normalized leaf centroid. */
  readonly centroid: readonly number[]
}

export interface ReassignmentSourceObservation {
  readonly observationId: string
  readonly embedding: readonly number[]
}

/** A rejection must be WRITTEN, not skipped: an untouched row keeps pointing at a cluster the swap deprecates. */
export type RoutedLeafAssignment =
  | {
      readonly observationId: string
      readonly method: "gardening_reassign"
      readonly assignedClusterId: TaxonomyClusterId
      /** Cosine similarity to the chosen leaf centroid, clamped to [0, 1]. */
      readonly confidence: number
    }
  | {
      readonly observationId: string
      readonly method: "noise"
      readonly assignedClusterId: null
      /** Cosine similarity to the nearest leaf, which failed the fit floor. */
      readonly confidence: number
    }

const routeOne = (
  observation: ReassignmentSourceObservation,
  leaves: readonly ReassignmentLeaf[],
  absoluteThreshold: number,
): RoutedLeafAssignment | null => {
  const { observationId, embedding } = observation
  if (leaves.length === 0 || embedding.length === 0) return null
  const normalized = normalizeTaxonomyEmbedding(embedding)
  if (normalized.length === 0) return null
  let best: ReassignmentLeaf | null = null
  let bestSimilarity = Number.NEGATIVE_INFINITY
  for (const leaf of leaves) {
    if (leaf.centroid.length === 0) continue
    const similarity = cosineSimilarityNormalized(normalized, leaf.centroid)
    // Deterministic tie-break: keep the first leaf (input order) on an exact tie.
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      best = leaf
    }
  }
  if (best === null) return null
  const confidence = Math.max(0, Math.min(1, bestSimilarity))
  if (confidence < absoluteThreshold) return { observationId, method: "noise", assignedClusterId: null, confidence }
  return { observationId, method: "gardening_reassign", assignedClusterId: best.clusterId, confidence }
}

/** Nearest staging leaf per observation, `noise` below `absoluteThreshold`. Empty embedding or no leaf is dropped. */
export const routeObservationsToLeaves = (
  observations: readonly ReassignmentSourceObservation[],
  leaves: readonly ReassignmentLeaf[],
  absoluteThreshold: number = TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
): readonly RoutedLeafAssignment[] => {
  const out: RoutedLeafAssignment[] = []
  for (const observation of observations) {
    const routed = routeOne(observation, leaves, absoluteThreshold)
    if (routed === null) continue
    out.push(routed)
  }
  return out
}
