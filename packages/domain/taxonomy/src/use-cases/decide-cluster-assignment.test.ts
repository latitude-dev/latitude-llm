import { OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { createTaxonomyCentroid } from "../helpers.ts"
import type { NearestClusterMatch } from "../ports/taxonomy-cluster-repository.ts"
import { routeObservationsToLeaves } from "../reassignment.ts"
import { decideClusterAssignment } from "./decide-cluster-assignment.ts"

const now = new Date("2026-08-17T00:00:00.000Z")

const cluster = (id: string): TaxonomyCluster => ({
  id: TaxonomyClusterId(id.repeat(24).slice(0, 24)),
  organizationId: OrganizationId("o".repeat(24)),
  projectId: ProjectId("p".repeat(24)),
  customBehaviorId: null,
  facetId: null,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "Export Financial Data as CSV",
  description: "Users export financial data",
  centroid: createTaxonomyCentroid(),
  observationCount: 50,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: now,
  lastObservedAt: now,
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
})

const match = (id: string, cosine: number): NearestClusterMatch => ({ cluster: cluster(id), cosine })

describe("decideClusterAssignment fit floor", () => {
  // Pins the calibrated value so a change is deliberate; rationale in dev-docs/taxonomy.md.
  it("is calibrated to the flat floor that spares the worst-hit projects", () => {
    expect(TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD).toBe(0.75)
  })

  it("rejects a lone candidate below the floor and admits one at it", () => {
    expect(decideClusterAssignment([match("a", TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD - 0.01)])).toMatchObject({
      method: "noise",
      clusterId: null,
    })
    expect(decideClusterAssignment([match("a", TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD)])).toMatchObject({
      method: "centroid_online",
    })
  })

  // 0.65 rather than a round number: the old gate bottomed out at exactly 0.6505.
  it("rejects the band the previous 0.65 gate admitted", () => {
    for (const cosine of [0.65, 0.7, 0.74]) {
      expect(decideClusterAssignment([match("a", cosine)]).method).toBe("noise")
    }
  })

  // Both paths read one constant, so neither can drift; it is NOT a claim that they
  // gate equivalently — online routing applies it at depth 0, reassignment at a leaf.
  it("reads the same constant on the online and full-window reassignment paths", () => {
    const belowFloor = TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD - 0.02
    const leaves = [{ clusterId: TaxonomyClusterId("a".repeat(24)), centroid: [1, 0] }]
    const embedding = [belowFloor, Math.sqrt(1 - belowFloor ** 2)]

    expect(decideClusterAssignment([match("a", belowFloor)]).method).toBe("noise")
    expect(routeObservationsToLeaves([{ observationId: "o1", embedding }], leaves)[0]?.method).toBe("noise")
  })
})
