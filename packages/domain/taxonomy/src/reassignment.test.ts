import type { TaxonomyClusterId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD } from "./constants.ts"
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

  describe("fit floor", () => {
    const onlyLeaf = [leaf("a".repeat(24), [1, 0])]
    // [cos, sin] against the [1, 0] centroid: cosine similarity IS the first element.
    const atSimilarity = (similarity: number) => [similarity, Math.sqrt(1 - similarity ** 2)]

    it("rejects as noise when even the nearest leaf is below the fit floor", () => {
      const routed = routeObservationsToLeaves(
        [{ observationId: "o1", embedding: atSimilarity(TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD - 0.05) }],
        onlyLeaf,
      )
      expect(routed[0]).toMatchObject({ observationId: "o1", method: "noise", assignedClusterId: null })
      // The measured similarity is still reported, so a rejection is diagnosable.
      expect(routed[0]?.confidence).toBeCloseTo(TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD - 0.05, 4)
    })

    it("assigns at the floor and above", () => {
      const routed = routeObservationsToLeaves(
        [
          { observationId: "at", embedding: atSimilarity(TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD) },
          { observationId: "above", embedding: atSimilarity(0.95) },
        ],
        onlyLeaf,
      )
      expect(routed.map((assignment) => assignment.method)).toEqual(["gardening_reassign", "gardening_reassign"])
      expect(routed.every((assignment) => assignment.assignedClusterId === "a".repeat(24))).toBe(true)
    })

    // LAT-862 QA: a topic that vanished from the new tree had all 14 of its sessions
    // filed into the nearest surviving cluster at 0.567, where genuine members sat at
    // 0.78-0.92. Unassigned is the correct answer for those sessions.
    it("leaves the sessions of a behaviour that was not rebuilt unassigned", () => {
      const orphaned = Array.from({ length: 14 }, (_, index) => ({
        observationId: `o${index}`,
        embedding: atSimilarity(0.567),
      }))
      const routed = routeObservationsToLeaves(orphaned, onlyLeaf)
      expect(routed).toHaveLength(14)
      expect(routed.every((assignment) => assignment.method === "noise")).toBe(true)
    })

    it("honours an explicit threshold over the default", () => {
      const observations = [{ observationId: "o1", embedding: atSimilarity(0.7) }]
      expect(routeObservationsToLeaves(observations, onlyLeaf, 0.6)[0]?.method).toBe("gardening_reassign")
      expect(routeObservationsToLeaves(observations, onlyLeaf, 0.75)[0]?.method).toBe("noise")
    })
  })
})
