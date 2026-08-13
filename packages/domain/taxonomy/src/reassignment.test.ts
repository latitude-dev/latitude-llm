import type { TaxonomyClusterId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { type ReassignmentLeaf, routeObservationsToLeaves } from "./reassignment.ts"

const leaf = (id: string, centroid: readonly number[]): ReassignmentLeaf => ({
  clusterId: id as TaxonomyClusterId,
  centroid,
})

describe("routeObservationsToLeaves", () => {
  const leaves = [leaf("a".repeat(24), [1, 0]), leaf("b".repeat(24), [0, 1])]

  it("routes each observation to its nearest leaf centroid", () => {
    const routed = routeObservationsToLeaves(
      [
        { observationId: "o1", embedding: [0.9, 0.1] },
        { observationId: "o2", embedding: [0.1, 0.9] },
      ],
      leaves,
    )
    expect(routed).toHaveLength(2)
    expect(routed[0]).toMatchObject({ observationId: "o1", assignedClusterId: "a".repeat(24) })
    expect(routed[1]).toMatchObject({ observationId: "o2", assignedClusterId: "b".repeat(24) })
    // Confidence is a clamped cosine similarity in [0, 1].
    expect(routed[0]?.confidence).toBeGreaterThan(0.9)
    expect(routed[0]?.confidence).toBeLessThanOrEqual(1)
  })

  it("routes the FULL window, not just a sample", () => {
    const observations = Array.from({ length: 100 }, (_, index) => ({
      observationId: `o${index}`,
      embedding: index % 2 === 0 ? [1, 0.02] : [0.02, 1],
    }))
    const routed = routeObservationsToLeaves(observations, leaves)
    expect(routed).toHaveLength(100)
  })

  it("drops observations with empty embeddings and returns nothing when there are no leaves", () => {
    expect(routeObservationsToLeaves([{ observationId: "o1", embedding: [] }], leaves)).toEqual([])
    expect(routeObservationsToLeaves([{ observationId: "o1", embedding: [1, 0] }], [])).toEqual([])
  })

  it("is deterministic: an exact tie keeps the first leaf in input order", () => {
    const tied = [leaf("a".repeat(24), [1, 0]), leaf("b".repeat(24), [1, 0])]
    const routed = routeObservationsToLeaves([{ observationId: "o1", embedding: [1, 0] }], tied)
    expect(routed[0]?.assignedClusterId).toBe("a".repeat(24))
  })
})
