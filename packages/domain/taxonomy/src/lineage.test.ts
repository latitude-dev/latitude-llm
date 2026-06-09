import { describe, expect, it } from "vitest"
import { type LineageOldCluster, matchTaxonomyLineage, solveAssignment } from "./lineage.ts"

// Unit vector at a given angle (radians) in the first two dimensions. Cosine of
// two such vectors is cos(θ₁ - θ₂), which lets tests dial similarity exactly.
const unit = (angle: number): number[] => [Math.cos(angle), Math.sin(angle)]
// Angle whose cosine-to-zero equals `c`, i.e. dot([1,0], unit(θ)) = c.
const angleForCosine = (c: number): number => Math.acos(c)

const CONTINUATION_THRESHOLD = 0.92
const NAME_REUSE_THRESHOLD = 0.95

describe("solveAssignment", () => {
  it("solves a 1×1 matrix", () => {
    expect(solveAssignment([[5]])).toEqual([0])
  })

  it("picks the diagonal when it is cheapest", () => {
    expect(
      solveAssignment([
        [1, 9],
        [9, 1],
      ]),
    ).toEqual([0, 1])
  })

  it("picks the anti-diagonal when it is cheapest", () => {
    expect(
      solveAssignment([
        [9, 1],
        [1, 9],
      ]),
    ).toEqual([1, 0])
  })

  it("finds the global optimum, not the greedy one", () => {
    // Greedy would take row0→col0 (1), forcing row1→col1 (100) = 101.
    // Optimal is row0→col1 (2) + row1→col0 (3) = 5.
    expect(
      solveAssignment([
        [1, 2],
        [3, 100],
      ]),
    ).toEqual([1, 0])
  })

  it("returns an empty assignment for an empty matrix", () => {
    expect(solveAssignment([])).toEqual([])
  })
})

describe("matchTaxonomyLineage", () => {
  const old = (id: string, angle: number, depth = 0): LineageOldCluster => ({ id, depth, centroid: unit(angle) })

  it("births every node when there are no previous clusters", () => {
    const result = matchTaxonomyLineage({
      newNodes: [
        { tempId: "0", depth: 0, centroid: unit(0) },
        { tempId: "1", depth: 0, centroid: unit(1) },
      ],
      oldClusters: [],
      continuationThreshold: CONTINUATION_THRESHOLD,
      nameReuseThreshold: NAME_REUSE_THRESHOLD,
    })
    expect(result.decisions.map((d) => d.transition)).toEqual(["birth", "birth"])
    expect(result.matchedOldIds.size).toBe(0)
  })

  it("reuses the old id and carries the name on a near-identical match", () => {
    const result = matchTaxonomyLineage({
      newNodes: [{ tempId: "0", depth: 0, centroid: unit(0) }],
      oldClusters: [old("old-a", 0)],
      continuationThreshold: CONTINUATION_THRESHOLD,
      nameReuseThreshold: NAME_REUSE_THRESHOLD,
    })
    const decision = result.decisions[0]
    expect(decision).toMatchObject({ transition: "continuation", reuseId: "old-a", carryName: true })
    expect(result.matchedOldIds.has("old-a")).toBe(true)
  })

  it("continues but does not carry the name when the topic drifted past the name-reuse band", () => {
    // cos = 0.93: above continuation (0.92), below name-reuse (0.95).
    const result = matchTaxonomyLineage({
      newNodes: [{ tempId: "0", depth: 0, centroid: unit(angleForCosine(0.93)) }],
      oldClusters: [old("old-a", 0)],
      continuationThreshold: CONTINUATION_THRESHOLD,
      nameReuseThreshold: NAME_REUSE_THRESHOLD,
    })
    expect(result.decisions[0]).toMatchObject({ transition: "continuation", reuseId: "old-a", carryName: false })
  })

  it("births the node and leaves the old cluster unmatched below the continuation threshold", () => {
    // cos = 0.90 < 0.92.
    const result = matchTaxonomyLineage({
      newNodes: [{ tempId: "0", depth: 0, centroid: unit(angleForCosine(0.9)) }],
      oldClusters: [old("old-a", 0)],
      continuationThreshold: CONTINUATION_THRESHOLD,
      nameReuseThreshold: NAME_REUSE_THRESHOLD,
    })
    expect(result.decisions[0]?.transition).toBe("birth")
    expect(result.matchedOldIds.size).toBe(0)
  })

  it("never matches across depths even when centroids are identical", () => {
    const result = matchTaxonomyLineage({
      newNodes: [{ tempId: "0", depth: 0, centroid: unit(0) }],
      oldClusters: [old("old-a", 0, 1)],
      continuationThreshold: CONTINUATION_THRESHOLD,
      nameReuseThreshold: NAME_REUSE_THRESHOLD,
    })
    expect(result.decisions[0]?.transition).toBe("birth")
    expect(result.matchedOldIds.size).toBe(0)
  })

  it("assigns 1:1 — each new node continues its own closest old cluster", () => {
    const result = matchTaxonomyLineage({
      newNodes: [
        { tempId: "a", depth: 0, centroid: unit(0) },
        { tempId: "b", depth: 0, centroid: unit(Math.PI / 2) },
      ],
      oldClusters: [old("X", 0), old("Y", Math.PI / 2)],
      continuationThreshold: CONTINUATION_THRESHOLD,
      nameReuseThreshold: NAME_REUSE_THRESHOLD,
    })
    const byTemp = new Map(result.decisions.map((d) => [d.tempId, d]))
    expect(byTemp.get("a")).toMatchObject({ transition: "continuation", reuseId: "X" })
    expect(byTemp.get("b")).toMatchObject({ transition: "continuation", reuseId: "Y" })
    expect([...result.matchedOldIds].sort()).toEqual(["X", "Y"])
  })

  it("does not double-assign one old cluster to two new nodes", () => {
    // Both new nodes are closest to X; only one may continue it, the other births.
    const result = matchTaxonomyLineage({
      newNodes: [
        { tempId: "a", depth: 0, centroid: unit(0) },
        { tempId: "b", depth: 0, centroid: unit(angleForCosine(0.99)) },
      ],
      oldClusters: [old("X", 0)],
      continuationThreshold: CONTINUATION_THRESHOLD,
      nameReuseThreshold: NAME_REUSE_THRESHOLD,
    })
    const continuations = result.decisions.filter((d) => d.transition === "continuation")
    expect(continuations).toHaveLength(1)
    expect(result.matchedOldIds.size).toBe(1)
  })
})
