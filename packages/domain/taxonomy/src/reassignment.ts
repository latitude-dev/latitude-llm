/**
 * Full-window reassignment routing.
 *
 * The adaptive publish path stages the whole new tree, then routes the *complete*
 * bounded live window (not just the ≤1,500 clustering sample) to the staging
 * leaves before the atomic swap, so no active read is left pointing at a
 * soon-to-deprecate cluster. Routing is a pure argmax of each observation's
 * embedding against the leaf centroids — the leaves partition the space, so
 * nearest-leaf matches the deepest-fit descent that built them, and it is
 * deterministic for Temporal replay.
 */

import type { TaxonomyClusterId } from "@domain/shared"
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

export interface RoutedLeafAssignment {
  readonly observationId: string
  readonly assignedClusterId: TaxonomyClusterId
  /** Cosine similarity to the chosen leaf centroid, clamped to [0, 1]. */
  readonly confidence: number
}

const routeOne = (embedding: readonly number[], leaves: readonly ReassignmentLeaf[]): RoutedLeafAssignment | null => {
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
  return {
    observationId: "",
    assignedClusterId: best.clusterId,
    confidence: Math.max(0, Math.min(1, bestSimilarity)),
  }
}

/** Route each observation to its nearest staging leaf. Observations with an empty
 * embedding or no candidate leaf are dropped. */
export const routeObservationsToLeaves = (
  observations: readonly ReassignmentSourceObservation[],
  leaves: readonly ReassignmentLeaf[],
): readonly RoutedLeafAssignment[] => {
  const out: RoutedLeafAssignment[] = []
  for (const observation of observations) {
    const routed = routeOne(observation.embedding, leaves)
    if (routed === null) continue
    out.push({ ...routed, observationId: observation.observationId })
  }
  return out
}
