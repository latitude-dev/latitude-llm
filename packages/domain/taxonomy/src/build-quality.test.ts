import { describe, expect, it } from "vitest"
import { promotedTopLevelRows, type ScaffoldingShape, taxonomyBuildQualityMetrics } from "./build-quality.ts"
import type { ClusteringTreeNode } from "./clustering.ts"

/** `memberIndices` at a node covers its whole subtree, so a parent's list is the union of its children's. */
const node = (memberIndices: readonly number[], children: readonly ClusteringTreeNode[] = []): ClusteringTreeNode => ({
  memberIndices,
  centroid: [],
  children,
  depth: 0,
})

const range = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, index) => from + index)

/** Unit vectors that share a strong common component, so raw cohesion is high for everything. */
const embedding = (angle: number, shared: number): readonly number[] => {
  const x = shared
  const y = Math.cos(angle)
  const z = Math.sin(angle)
  const norm = Math.sqrt(x * x + y * y + z * z)
  return [x / norm, y / norm, z / norm]
}

describe("taxonomyBuildQualityMetrics", () => {
  it("reports the leaf-size vector and the largest leaf's share of one build's partition", () => {
    const tree = node(range(0, 100), [node(range(0, 70)), node(range(70, 90)), node(range(90, 100))])

    const metrics = taxonomyBuildQualityMetrics({ root: tree, embeddings: [] })

    expect(metrics.leaves.map((leaf) => leaf.size)).toEqual([70, 20, 10])
    expect(metrics.largestLeafShare).toBeCloseTo(0.7)
    expect(metrics.membersClustered).toBe(100)
    expect(metrics.leafCount).toBe(3)
  })

  it("separates a residue leaf from a genuine one on centered cohesion where raw cohesion cannot", () => {
    // Leaf A spans the whole angular range (a residue); leaf B is a tight arc.
    const residue = range(0, 24).map((index) => embedding((index / 24) * 2 * Math.PI, 3))
    const genuine = range(0, 24).map((index) => embedding(0.9 + (index / 24) * 0.2, 3))
    const embeddings = [...residue, ...genuine]
    const tree = node(range(0, 48), [node(range(0, 24)), node(range(24, 48))])

    const metrics = taxonomyBuildQualityMetrics({ root: tree, embeddings })
    const [first, second] = metrics.leaves

    // Equal sizes, so order is stable on input order: residue first.
    expect(first?.centeredCohesion).toBeLessThan(0.5)
    expect(second?.centeredCohesion).toBeGreaterThan(0.9)
  })

  it("counts top-level rows after content-free interiors are promoted, not the root's children", () => {
    const tree = node(range(0, 100), [
      node(range(0, 60), [node(range(0, 35)), node(range(35, 60))]),
      node(range(60, 100), [node(range(60, 80)), node(range(80, 100))]),
    ])

    const metrics = taxonomyBuildQualityMetrics({ root: tree, embeddings: [] })

    // The two interiors hold nothing of their own, so the user sees four rows, not two.
    expect(metrics.topLevelRowCount).toBe(4)
    expect(metrics.largestTopLevelShare).toBeCloseTo(0.35)
  })

  it("keeps a childless root as its own row instead of reporting an empty screen", () => {
    const tree = node(range(0, 1946))

    const metrics = taxonomyBuildQualityMetrics({ root: tree, embeddings: [] })

    expect(metrics.topLevelRowCount).toBe(1)
    expect(metrics.largestTopLevelShare).toBeCloseTo(1)
    expect(metrics.largestLeafShare).toBeCloseTo(1)
  })

  it("has no leaves and no shares when nothing was clustered", () => {
    const metrics = taxonomyBuildQualityMetrics({ root: node([]), embeddings: [] })

    expect(metrics.largestLeafShare).toBe(0)
    expect(metrics.largestTopLevelShare).toBe(0)
  })
})

interface Row {
  readonly id: string
  readonly own: number
  readonly children: readonly Row[]
}

const row = (id: string, own: number, children: readonly Row[] = []): Row => ({ id, own, children })

const subtree = (node: Row): number => node.own + node.children.reduce((sum, child) => sum + subtree(child), 0)

const rowShape = (node: Row): ScaffoldingShape<Row> => ({
  ownMemberCount: node.own,
  subtreeMemberCount: subtree(node),
  children: node.children,
})

const ids = (rows: readonly Row[]): readonly string[] => rows.map((node) => node.id)

describe("promotedTopLevelRows", () => {
  it("leaves an already-flat tree untouched and in order", () => {
    const root = row("R", 0, [row("A", 30), row("B", 20), row("C", 10)])

    expect(ids(promotedTopLevelRows(root, rowShape))).toEqual(["A", "B", "C"])
  })

  it("collapses a whole chain of signposts in one pass, not one level per call", () => {
    const root = row("R", 0, [row("I1", 0, [row("I2", 0, [row("L1", 30), row("L2", 20)])])])

    expect(ids(promotedTopLevelRows(root, rowShape))).toEqual(["L1", "L2"])
  })

  it("keeps a content-holding interior as a parent instead of flattening to its leaves", () => {
    const root = row("R", 0, [
      row("A", 40, [row("A1", 30), row("A2", 20)]),
      row("B", 0, [row("B1", 10), row("B2", 10)]),
    ])

    const rows = promotedTopLevelRows(root, rowShape)

    expect(ids(rows)).toEqual(["A", "B1", "B2"])
    expect(ids(rows[0]?.children ?? [])).toEqual(["A1", "A2"])
  })

  it("promotes an interior holding a single member — a strict-zero rule would silently keep it", () => {
    const root = row("R", 1, [row("I", 1, [row("L1", 99), row("L2", 55)]), row("L3", 494)])

    expect(ids(promotedTopLevelRows(root, rowShape))).toEqual(["L1", "L2", "L3"])
  })

  it("unwraps a member-holding root positionally rather than on a content test", () => {
    const root = row("R", 9, [row("A", 40), row("B", 30)])

    expect(ids(promotedTopLevelRows(root, rowShape))).toEqual(["A", "B"])
  })
})
