import { describe, expect, it } from "vitest"
import type { ClusteringTreeNode } from "./clustering.ts"
import {
  adjustedRandIndex,
  boundedPercentiles,
  compareTaxonomyTrees,
  leafPartitionLabels,
  summarizeTreeShape,
} from "./shadow-comparison.ts"

const leaf = (depth: number, memberIndices: readonly number[]): ClusteringTreeNode => ({
  memberIndices,
  centroid: [1, 0],
  children: [],
  depth,
})

const node = (depth: number, children: readonly ClusteringTreeNode[]): ClusteringTreeNode => ({
  memberIndices: children.flatMap((child) => child.memberIndices),
  centroid: [1, 0],
  children,
  depth,
})

// Static tell: a single collapsed root child. Adaptive: three separated children.
const staticRoot = node(0, [leaf(1, [0, 1, 2, 3, 4, 5])])
const adaptiveRoot = node(0, [leaf(1, [0, 1]), leaf(1, [2, 3]), leaf(1, [4, 5])])

describe("summarizeTreeShape", () => {
  it("counts root children, nodes, leaves, and max depth including the hidden root", () => {
    expect(summarizeTreeShape(staticRoot)).toEqual({ rootChildCount: 1, nodeCount: 2, leafCount: 1, maxDepth: 1 })
    expect(summarizeTreeShape(adaptiveRoot)).toEqual({ rootChildCount: 3, nodeCount: 4, leafCount: 3, maxDepth: 1 })
  })
})

describe("boundedPercentiles", () => {
  it("summarizes to p10/p50/p90 and never returns the raw array", () => {
    const percentiles = boundedPercentiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(percentiles.p10).toBeCloseTo(1)
    expect(percentiles.p50).toBeCloseTo(5)
    expect(percentiles.p90).toBeCloseTo(9)
  })

  it("is zero-safe on an empty distribution", () => {
    expect(boundedPercentiles([])).toEqual({ p10: 0, p50: 0, p90: 0 })
  })
})

describe("leafPartitionLabels", () => {
  it("stamps each member with its leaf ordinal", () => {
    expect(leafPartitionLabels(adaptiveRoot, 6)).toEqual([0, 0, 1, 1, 2, 2])
  })

  it("leaves unseen members in their own singleton bucket (-1)", () => {
    expect(leafPartitionLabels(node(0, [leaf(1, [0, 1])]), 4)).toEqual([0, 0, -1, -1])
  })
})

describe("adjustedRandIndex", () => {
  it("is 1 for identical partitions", () => {
    expect(adjustedRandIndex([0, 0, 1, 1], [1, 1, 0, 0])).toBeCloseTo(1)
  })

  it("is 1 when both sides collapse to one cluster (degenerate agreement)", () => {
    expect(adjustedRandIndex([0, 0, 0, 0], [0, 0, 0, 0])).toBeCloseTo(1)
  })

  it("drops below 1 when the partitions genuinely disagree", () => {
    const ari = adjustedRandIndex([0, 0, 1, 1], [0, 1, 0, 1])
    expect(ari).toBeLessThan(1)
  })
})

describe("compareTaxonomyTrees", () => {
  it("captures static-vs-adaptive shape counts, deltas, and partition ARI", () => {
    const comparison = compareTaxonomyTrees({ staticRoot, adaptiveRoot, sampleSize: 6 })
    expect(comparison.static.rootChildCount).toBe(1)
    expect(comparison.adaptive.rootChildCount).toBe(3)
    expect(comparison.diff.rootChildDelta).toBe(2)
    expect(comparison.diff.leafCountDelta).toBe(2)
    // The collapsed static leaf disagrees with the three adaptive leaves.
    expect(comparison.diff.partitionAri).toBeLessThan(1)
  })
})
