/**
 * Fallback selection for enforced adaptive planning: decide, purely from the
 * built tree and its diagnostics, whether the adaptive output is unsafe to
 * persist and the run must fall back to the static tree. Resolved in the
 * planning activity BEFORE any staging or writes.
 *
 * Two failure classes, per the rollout spec:
 *   - `nonFinite`       a NaN/Infinity slipped into a relative metric or a node
 *                       centroid/threshold. The builder already raises
 *                       `diagnostics.fellBackToStatic` for this; we re-check the
 *                       persisted shape defensively.
 *   - `structuralLimit` the tree breaks a bound the depth schedule guarantees
 *                       (deeper than the schedule, or more nodes than the
 *                       calibrated cap) — a builder fault rather than a
 *                       legitimate corpus.
 */

import type { ClusteringTreeNode, RelativeClusteringDiagnostics } from "./clustering.ts"

export type TaxonomyAdaptiveFallbackReason = "nonFinite" | "structuralLimit"

const hasNonFiniteNode = (node: ClusteringTreeNode): boolean => {
  if (node.splitLinkThreshold !== undefined && !Number.isFinite(node.splitLinkThreshold)) return true
  for (const value of node.centroid) if (!Number.isFinite(value)) return true
  return node.children.some(hasNonFiniteNode)
}

const depthAndNodeCount = (root: ClusteringTreeNode): { readonly maxDepth: number; readonly nodeCount: number } => {
  let maxDepth = 0
  let nodeCount = 0
  const visit = (node: ClusteringTreeNode): void => {
    nodeCount++
    if (node.depth > maxDepth) maxDepth = node.depth
    for (const child of node.children) visit(child)
  }
  visit(root)
  return { maxDepth, nodeCount }
}

export const adaptiveFallbackReason = (input: {
  readonly root: ClusteringTreeNode
  readonly diagnostics: RelativeClusteringDiagnostics | null
  /** Deepest node depth the relative depth schedule can produce. */
  readonly maxDepth: number
  /** Structural ceiling on total node count. */
  readonly maxNodes: number
}): TaxonomyAdaptiveFallbackReason | null => {
  const { diagnostics } = input
  if (diagnostics?.fellBackToStatic) return "nonFinite"
  if (diagnostics) {
    for (const value of [...diagnostics.acceptedRelativeSeparations, ...diagnostics.routingThresholds]) {
      if (!Number.isFinite(value)) return "nonFinite"
    }
  }
  if (hasNonFiniteNode(input.root)) return "nonFinite"
  const { maxDepth, nodeCount } = depthAndNodeCount(input.root)
  if (nodeCount < 1 || nodeCount > input.maxNodes || maxDepth > input.maxDepth) return "structuralLimit"
  return null
}
