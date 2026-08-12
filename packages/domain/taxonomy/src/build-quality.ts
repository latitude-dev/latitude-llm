/**
 * Quality metrics for one build's partition.
 *
 * Measured on a SINGLE build's tree: the same shares taken from live
 * `assigned_cluster_id` over a window mix in deprecated clusters and read far
 * too low. Cohesion is mean-centered for measurement only — centering the
 * vectors the builder sees is a measured regression.
 */

import type { ClusteringTreeNode } from "./clustering.ts"
import { TAXONOMY_QUALITY_LEAF_PROFILE_MAX, TAXONOMY_SCAFFOLDING_MAX_OWN_FRACTION } from "./constants.ts"
import { type BoundedPercentiles, boundedPercentiles } from "./telemetry-percentiles.ts"

export interface TaxonomyLeafQuality {
  readonly size: number
  /** Mean cosine of the leaf's corpus-mean-centered members to their centered centroid. */
  readonly centeredCohesion: number
}

export interface TaxonomyBuildQualityMetrics {
  /** Denominator for every share below: members the build actually partitioned. */
  readonly membersClustered: number
  readonly leafCount: number
  readonly largestLeafShare: number
  /**
   * Rows left after scaffolding is promoted away, not the root's child count
   * (`topLevelClustersBuilt`); it matches the screen only once the de-nesting read ships.
   */
  readonly topLevelRowCount: number
  readonly largestTopLevelShare: number
  /** Members promoted-away nodes held, so they sit in no row: rows + this = `membersClustered`. */
  readonly promotedResidue: number
  /** Over EVERY leaf, so a residue leaf outside the bounded profile below still moves them. */
  readonly centeredCohesion: BoundedPercentiles & { readonly min: number }
  /** Size-descending and bounded; `leafCount - leaves.length` were dropped by the bound. */
  readonly leaves: readonly TaxonomyLeafQuality[]
}

/** What the promotion rule reads off a node, whatever the node's own type is. */
export interface ScaffoldingShape<T> {
  readonly ownMemberCount: number
  readonly subtreeMemberCount: number
  readonly children: readonly T[]
}

/** Strict zero is not enough: a real signpost can hold one member of its own. */
const isScaffolding = <T>(shape: ScaffoldingShape<T>): boolean =>
  shape.children.length > 0 &&
  shape.ownMemberCount <= Math.max(1, TAXONOMY_SCAFFOLDING_MAX_OWN_FRACTION * shape.subtreeMemberCount)

/** Content-based, not "flatten everything": an interior holding real members survives as a parent. */
export const promoteScaffolding = <T>(nodes: readonly T[], shapeOf: (node: T) => ScaffoldingShape<T>): readonly T[] =>
  nodes.flatMap((node) => {
    const shape = shapeOf(node)
    return isScaffolding(shape) ? promoteScaffolding(shape.children, shapeOf) : [node]
  })

/**
 * The root is unwrapped positionally, never on a content test — it is the "everything"
 * node, and leaving it visible reinstates the single all-encompassing row. A childless
 * root is the exception: dropping it empties the screen of a project that has only one.
 */
export const promotedTopLevelRows = <T>(root: T, shapeOf: (node: T) => ScaffoldingShape<T>): readonly T[] => {
  const children = shapeOf(root).children
  return children.length === 0 ? [root] : promoteScaffolding(children, shapeOf)
}

/** `memberIndices` carries every member at a node, so a node's own share is what its children do not hold. */
const clusteringShape = (node: ClusteringTreeNode): ScaffoldingShape<ClusteringTreeNode> => {
  const subtreeMemberCount = node.memberIndices.length
  const inChildren = node.children.reduce((sum, child) => sum + child.memberIndices.length, 0)
  return {
    ownMemberCount: Math.max(0, subtreeMemberCount - inChildren),
    subtreeMemberCount,
    children: node.children,
  }
}

const collectLeaves = (node: ClusteringTreeNode): readonly ClusteringTreeNode[] =>
  node.children.length === 0 ? [node] : node.children.flatMap(collectLeaves)

const unitVector = (vector: readonly number[]): readonly number[] | null => {
  let squared = 0
  for (const value of vector) squared += value * value
  if (!Number.isFinite(squared) || squared === 0) return null
  const norm = Math.sqrt(squared)
  return vector.map((value) => value / norm)
}

const meanVector = (vectors: readonly (readonly number[])[]): readonly number[] => {
  const dimensions = vectors[0]?.length ?? 0
  if (dimensions === 0) return []
  const sums = new Array<number>(dimensions).fill(0)
  let counted = 0
  for (const vector of vectors) {
    if (vector.length !== dimensions) continue
    for (let dimension = 0; dimension < dimensions; dimension++) {
      sums[dimension] = (sums[dimension] ?? 0) + (vector[dimension] ?? 0)
    }
    counted++
  }
  return counted === 0 ? [] : sums.map((sum) => sum / counted)
}

const memberVectors = (
  memberIndices: readonly number[],
  embeddings: readonly (readonly number[])[],
): readonly (readonly number[])[] =>
  memberIndices.flatMap((index) => {
    const embedding = embeddings[index]
    return embedding && embedding.length > 0 ? [embedding] : []
  })

const dot = (a: readonly number[], b: readonly number[]): number => {
  let total = 0
  for (let dimension = 0; dimension < a.length; dimension++) total += (a[dimension] ?? 0) * (b[dimension] ?? 0)
  return total
}

const centeredCohesion = (members: readonly (readonly number[])[], corpusMean: readonly number[]): number => {
  if (corpusMean.length === 0) return 0
  const centered = members.flatMap((embedding) => {
    if (embedding.length !== corpusMean.length) return []
    const vector = unitVector(embedding.map((value, dimension) => value - (corpusMean[dimension] ?? 0)))
    return vector ? [vector] : []
  })
  if (centered.length === 0) return 0
  const centroid = unitVector(meanVector(centered))
  if (!centroid) return 0
  return centered.reduce((sum, vector) => sum + dot(vector, centroid), 0) / centered.length
}

const share = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole)

export const taxonomyBuildQualityMetrics = (input: {
  readonly root: ClusteringTreeNode
  /** The normalized sample the build partitioned, indexed by `memberIndices`. */
  readonly embeddings: readonly (readonly number[])[]
}): TaxonomyBuildQualityMetrics => {
  const membersClustered = input.root.memberIndices.length
  const corpusMean = meanVector(memberVectors(input.root.memberIndices, input.embeddings))
  const leaves = collectLeaves(input.root)
    .map((leaf) => ({
      size: leaf.memberIndices.length,
      centeredCohesion: centeredCohesion(memberVectors(leaf.memberIndices, input.embeddings), corpusMean),
    }))
    .sort((a, b) => b.size - a.size)
  const rows = promotedTopLevelRows(input.root, clusteringShape)
  const largestRow = rows.reduce((max, row) => Math.max(max, row.memberIndices.length), 0)
  const inRows = rows.reduce((sum, row) => sum + row.memberIndices.length, 0)
  const cohesions = leaves.map((leaf) => leaf.centeredCohesion)
  return {
    membersClustered,
    leafCount: leaves.length,
    largestLeafShare: share(leaves[0]?.size ?? 0, membersClustered),
    topLevelRowCount: rows.length,
    largestTopLevelShare: share(largestRow, membersClustered),
    promotedResidue: Math.max(0, membersClustered - inRows),
    // Computed before the profile is truncated, so the worst leaf cannot hide past the bound.
    centeredCohesion: { ...boundedPercentiles(cohesions), min: cohesions.length === 0 ? 0 : Math.min(...cohesions) },
    leaves: leaves.slice(0, TAXONOMY_QUALITY_LEAF_PROFILE_MAX),
  }
}
