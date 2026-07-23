import { describe, expect, it } from "vitest"
import { adaptiveFallbackReason } from "./adaptive-fallback.ts"
import type { ClusteringTreeNode, RelativeClusteringDiagnostics } from "./clustering.ts"

const leaf = (depth: number, centroid: readonly number[] = [1, 0]): ClusteringTreeNode => ({
  memberIndices: [0],
  centroid,
  children: [],
  depth,
})

const root = (children: readonly ClusteringTreeNode[]): ClusteringTreeNode => ({
  memberIndices: [0],
  centroid: [1, 0],
  children,
  depth: 0,
})

const healthyDiagnostics = (): RelativeClusteringDiagnostics => ({
  selectedKByDepth: { 0: [2] },
  nodeCount: 3,
  leafCount: 2,
  maxDepth: 1,
  acceptedSplits: 1,
  rejectedCandidates: 0,
  rejectionReasonCounts: { undersizedChild: 0, dominantChild: 0, lowScore: 0, lowRelativeSeparation: 0 },
  acceptedRelativeSeparations: [0.5],
  routingThresholds: [0.8],
  fellBackToStatic: false,
})

const chainToDepth = (maxDepth: number): ClusteringTreeNode => {
  let node: ClusteringTreeNode = leaf(maxDepth)
  for (let depth = maxDepth - 1; depth >= 0; depth--) {
    node = { memberIndices: [0], centroid: [1, 0], children: [node], depth }
  }
  return node
}

const bounds = { maxDepth: 3, maxNodes: 1_024 }

describe("adaptiveFallbackReason", () => {
  it("returns null for a finite, structurally-sane tree", () => {
    expect(
      adaptiveFallbackReason({ root: root([leaf(1), leaf(1)]), diagnostics: healthyDiagnostics(), ...bounds }),
    ).toBeNull()
  })

  it("flags nonFinite when the builder already raised fellBackToStatic", () => {
    expect(
      adaptiveFallbackReason({
        root: root([leaf(1), leaf(1)]),
        diagnostics: { ...healthyDiagnostics(), fellBackToStatic: true },
        ...bounds,
      }),
    ).toBe("nonFinite")
  })

  it("flags nonFinite on a non-finite diagnostic metric", () => {
    expect(
      adaptiveFallbackReason({
        root: root([leaf(1), leaf(1)]),
        diagnostics: { ...healthyDiagnostics(), routingThresholds: [Number.NaN] },
        ...bounds,
      }),
    ).toBe("nonFinite")
  })

  it("flags nonFinite on a non-finite node centroid even without diagnostics", () => {
    expect(adaptiveFallbackReason({ root: root([leaf(1, [Number.NaN, 0])]), diagnostics: null, ...bounds })).toBe(
      "nonFinite",
    )
  })

  it("flags structuralLimit when the tree is deeper than the schedule allows", () => {
    expect(adaptiveFallbackReason({ root: chainToDepth(5), diagnostics: null, ...bounds })).toBe("structuralLimit")
  })

  it("flags structuralLimit when the node count exceeds the cap", () => {
    expect(
      adaptiveFallbackReason({ root: root([leaf(1), leaf(1)]), diagnostics: null, maxDepth: 3, maxNodes: 2 }),
    ).toBe("structuralLimit")
  })
})
