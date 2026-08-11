/**
 * Quality metrics for one build's partition — pure arithmetic over the tree the
 * build produced and the sample it was built from. No LLM, no repository, no
 * effect on what gets clustered or persisted.
 *
 * Two traps this module exists to encode:
 *
 * 1. Every share here is computed from a SINGLE build's partition. Deriving the
 *    same numbers from live `assigned_cluster_id` over a time window mixes the
 *    current tree with historical online assignments to deprecated clusters and
 *    biases them badly (two projects measured both ways came out 0.22 vs 0.54
 *    and 0.45 vs 0.87). A dashboard query must scope to one `reassignment_run_id`.
 * 2. Cohesion is mean-centered to MEASURE only. Raw cohesion spans 0.85-0.94
 *    across residue and genuine leaves alike because the corpus-wide shared
 *    component inflates both; centering separates them around 0.35-0.45. Feeding
 *    centered vectors to the builder is a separately measured regression, so
 *    nothing computed here is ever read back into clustering.
 */

import type { ClusteringTreeNode } from "./clustering.ts"
import { TAXONOMY_QUALITY_LEAF_PROFILE_MAX, TAXONOMY_SCAFFOLDING_MAX_OWN_FRACTION } from "./constants.ts"

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
   * Rows the Behaviours screen renders once content-free scaffolding is promoted
   * away — distinct from `topLevelClustersBuilt`, which is the root's literal
   * child count, and the number the user actually sees only once the de-nesting
   * read lands. The divisive builder routes every member to a leaf, so today's
   * interiors all hold nothing and this equals `leafCount`; that is a fact about
   * the current builder, not the definition.
   */
  readonly topLevelRowCount: number
  readonly largestTopLevelShare: number
  /** Size-descending and bounded; `leafCount - leaves.length` were dropped by the bound. */
  readonly leaves: readonly TaxonomyLeafQuality[]
}

/** What the promotion rule reads off a node, whatever the node's own type is. */
export interface ScaffoldingShape<T> {
  readonly ownMemberCount: number
  readonly subtreeMemberCount: number
  readonly children: readonly T[]
}

/**
 * A node holds nothing of its own: it exists only to bracket its children, so
 * the rows below it are what the user should see. The threshold is not a free
 * parameter — swept from `own = 0` through `own <= 10% of subtree` across 8
 * production trees it produced identical output at every setting — but strict
 * zero is not enough either, since one project's depth-1 signpost holds exactly
 * one member.
 */
const isScaffolding = <T>(shape: ScaffoldingShape<T>): boolean =>
  shape.children.length > 0 &&
  shape.ownMemberCount <= Math.max(1, TAXONOMY_SCAFFOLDING_MAX_OWN_FRACTION * shape.subtreeMemberCount)

/**
 * Replace every content-free interior with its children, recursively and at any
 * depth. Content-based, not "flatten everything": an interior that holds real
 * members of its own survives as a parent even though no tree in the current
 * fleet has one.
 */
export const promoteScaffolding = <T>(nodes: readonly T[], shapeOf: (node: T) => ScaffoldingShape<T>): readonly T[] =>
  nodes.flatMap((node) => {
    const shape = shapeOf(node)
    return isScaffolding(shape) ? promoteScaffolding(shape.children, shapeOf) : [node]
  })

/**
 * The root is the "everything" node by construction, so it is unwrapped
 * positionally rather than on a content test — a member-holding root left
 * visible would be the single all-encompassing row this rule exists to remove.
 * A childless root is the exception and stays: one project is a lone root with
 * ~1,900 members, and returning nothing there empties its whole screen.
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
  return {
    membersClustered,
    leafCount: leaves.length,
    largestLeafShare: share(leaves[0]?.size ?? 0, membersClustered),
    topLevelRowCount: rows.length,
    largestTopLevelShare: share(largestRow, membersClustered),
    leaves: leaves.slice(0, TAXONOMY_QUALITY_LEAF_PROFILE_MAX),
  }
}
