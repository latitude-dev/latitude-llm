import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import {
  ChSqlClient,
  CustomBehaviorId,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  type TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { createTaxonomyCentroid, updateTaxonomyCentroid } from "../helpers.ts"
import { CustomBehaviorAssignmentRepository } from "../ports/custom-behavior-assignment-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import type { TaxonomyScopedClusteringObservation } from "../ports/taxonomy-observation-repository.ts"
import { createFakeCustomBehaviorAssignmentRepository } from "../testing/fake-custom-behavior-assignment-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { buildCustomBehaviorTaxonomyUseCase } from "./build-custom-behavior-taxonomy.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const customBehaviorId = CustomBehaviorId("b".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))

const vector = (values: Record<number, number>) => {
  const result = new Array(EMBEDDING_DIMENSIONS).fill(0)
  for (const [index, value] of Object.entries(values)) result[Number(index)] = value
  return result
}

const E1 = vector({ 0: 1 })
const E2 = vector({ 1: 1 })

const makeObservation = (
  index: number,
  embedding: readonly number[],
  at: Date,
): TaxonomyScopedClusteringObservation => ({
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`session-${index}`),
  embedding: [...embedding],
  startTime: new Date(at.getTime() + index * 1000),
})

const centroidFrom = (embedding: readonly number[], at: Date) => {
  const centroid = createTaxonomyCentroid()
  const updated = updateTaxonomyCentroid({
    centroid: { ...centroid, clusteredAt: at },
    embedding,
    weight: 1,
    timestamp: at,
    operation: "add",
    previousClusteredAt: at,
  })
  const { clusteredAt: _clusteredAt, ...withoutAnchor } = updated
  return withoutAnchor
}

const makeCluster = (overrides: Partial<TaxonomyCluster>): TaxonomyCluster => ({
  id: "c".repeat(24) as TaxonomyClusterId,
  organizationId,
  projectId,
  customBehaviorId,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "Existing scoped topic",
  description: "An existing scoped topic.",
  centroid: centroidFrom(E1, new Date("2026-01-01T00:00:00.000Z")),
  observationCount: 20,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: new Date("2026-01-01T00:00:00.000Z"),
  lastObservedAt: new Date("2026-01-01T00:00:00.000Z"),
  clusteredAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
})

const runBuild = (
  observations: readonly TaxonomyScopedClusteringObservation[],
  clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>,
  assignments: ReturnType<typeof createFakeCustomBehaviorAssignmentRepository>,
  now: Date,
) =>
  Effect.runPromise(
    buildCustomBehaviorTaxonomyUseCase({
      organizationId,
      projectId,
      customBehaviorId,
      runId,
      observations,
      dimension: "topic",
      now,
    }).pipe(
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(CustomBehaviorAssignmentRepository, assignments.repository)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    ),
  )

describe("buildCustomBehaviorTaxonomyUseCase", () => {
  it("writes scoped clusters and behavior assignments from the provided sample", async () => {
    const now = new Date("2026-05-24T12:00:00.000Z")
    const observations = Array.from({ length: 20 }, (_, index) => makeObservation(index, E1, now))
    const clusters = createFakeTaxonomyClusterRepository([])
    const assignments = createFakeCustomBehaviorAssignmentRepository()

    const result = await runBuild(observations, clusters, assignments, now)

    expect(result.observationsSampled).toBe(20)
    expect(result.clustersBorn).toBe(1)
    expect(result.clustersContinued).toBe(0)
    expect(result.leavesAssigned).toBe(20)
    expect(result.deprecatedClusterIds).toEqual([])

    // Every persisted cluster is tagged with the behavior scope, never the global tree.
    const persisted = [...clusters.clusters.values()]
    expect(persisted).toHaveLength(1)
    expect(persisted.every((cluster) => cluster.customBehaviorId === customBehaviorId)).toBe(true)
    expect(persisted[0]?.name).toBe("Pending")

    // Assignments land in the behavior slice and reference the born leaf.
    expect(assignments.assignments).toHaveLength(20)
    expect(assignments.assignments.every((a) => a.customBehaviorId === customBehaviorId)).toBe(true)
    expect(assignments.assignments.every((a) => a.assignedClusterId === persisted[0]?.id)).toBe(true)
    expect(assignments.assignments[0]?.assignmentMethod).toBe("gardening_birth")
    expect(assignments.assignments[0]?.reassignmentRunId).toBe(runId)
  })

  it("reuses the scoped cluster id across passes when the topic is unchanged", async () => {
    const pass1 = new Date("2026-05-24T12:00:00.000Z")
    const observations = Array.from({ length: 20 }, (_, index) => makeObservation(index, E1, pass1))
    const clusters = createFakeTaxonomyClusterRepository([])
    const assignments = createFakeCustomBehaviorAssignmentRepository()

    const first = await runBuild(observations, clusters, assignments, pass1)
    expect(first.clustersBorn).toBe(1)
    const firstId = [...clusters.clusters.values()][0]?.id

    const pass2 = new Date("2026-05-24T18:00:00.000Z")
    const second = await runBuild(observations, clusters, assignments, pass2)

    expect(second.clustersContinued).toBe(1)
    expect(second.clustersBorn).toBe(0)
    expect(second.deprecatedClusterIds).toEqual([])
    expect([...clusters.clusters.values()]).toHaveLength(1)
    expect([...clusters.clusters.values()][0]?.id).toBe(firstId)
    // Age is preserved across the rebuild via the reused id.
    expect(clusters.clusters.get(firstId as TaxonomyClusterId)?.firstObservedAt).toEqual(new Date(pass1.getTime()))
  })

  it("returns prior scoped clusters for deprecation without touching them when the topic changed", async () => {
    const old = makeCluster({
      id: "a".repeat(24) as TaxonomyClusterId,
      centroid: centroidFrom(E1, new Date("2026-01-01T00:00:00.000Z")),
    })
    const now = new Date("2026-05-24T12:00:00.000Z")
    const observations = Array.from({ length: 20 }, (_, index) => makeObservation(index, E2, now))
    const clusters = createFakeTaxonomyClusterRepository([old])
    const assignments = createFakeCustomBehaviorAssignmentRepository()

    const result = await runBuild(observations, clusters, assignments, now)

    expect(result.clustersBorn).toBe(1)
    expect(result.clustersContinued).toBe(0)
    expect(result.deprecatedClusterIds).toEqual([old.id])
    // The prior cluster is NOT deprecated here — the caller does that after the run succeeds.
    expect(clusters.clusters.get(old.id)?.state).toBe("active")
  })

  it("ignores another behavior's active clusters when matching lineage", async () => {
    const otherBehaviorCluster = makeCluster({
      id: "d".repeat(24) as TaxonomyClusterId,
      customBehaviorId: CustomBehaviorId("z".repeat(24)),
      centroid: centroidFrom(E1, new Date("2026-01-01T00:00:00.000Z")),
    })
    const now = new Date("2026-05-24T12:00:00.000Z")
    const observations = Array.from({ length: 20 }, (_, index) => makeObservation(index, E1, now))
    const clusters = createFakeTaxonomyClusterRepository([otherBehaviorCluster])
    const assignments = createFakeCustomBehaviorAssignmentRepository()

    const result = await runBuild(observations, clusters, assignments, now)

    // Same embedding as the other behavior's cluster, but scope isolation means
    // it is a fresh birth, not a continuation, and nothing is deprecated.
    expect(result.clustersBorn).toBe(1)
    expect(result.clustersContinued).toBe(0)
    expect(result.deprecatedClusterIds).toEqual([])
    expect(clusters.clusters.get(otherBehaviorCluster.id)?.state).toBe("active")
  })

  it("deprecates the clusters it wrote when persistence fails partway (no half-built active tree)", async () => {
    const now = new Date("2026-05-24T12:00:00.000Z")
    const observations = Array.from({ length: 20 }, (_, index) => makeObservation(index, E1, now))
    const clusters = createFakeTaxonomyClusterRepository([])
    const assignments = createFakeCustomBehaviorAssignmentRepository(
      {},
      { upsertMany: () => Effect.die(new Error("assignment upsert failed")) },
    )

    await expect(runBuild(observations, clusters, assignments, now)).rejects.toThrow()

    // Clusters were saved during materialize, then the upsert failed — the
    // self-compensation must leave none of them active.
    const persisted = [...clusters.clusters.values()]
    expect(persisted.length).toBeGreaterThan(0)
    expect(persisted.every((cluster) => cluster.state === "deprecated")).toBe(true)
  })

  it("leaves the prior scoped tree active when persistence fails on regeneration", async () => {
    const old = makeCluster({
      id: "a".repeat(24) as TaxonomyClusterId,
      centroid: centroidFrom(E1, new Date("2026-01-01T00:00:00.000Z")),
    })
    const now = new Date("2026-05-24T12:00:00.000Z")
    const observations = Array.from({ length: 20 }, (_, index) => makeObservation(index, E2, now))
    const clusters = createFakeTaxonomyClusterRepository([old])
    const assignments = createFakeCustomBehaviorAssignmentRepository(
      {},
      { upsertMany: () => Effect.die(new Error("assignment upsert failed")) },
    )

    await expect(runBuild(observations, clusters, assignments, now)).rejects.toThrow()

    expect(clusters.clusters.get(old.id)?.state).toBe("active")
    const born = [...clusters.clusters.values()].filter((cluster) => cluster.id !== old.id)
    expect(born.length).toBeGreaterThan(0)
    expect(born.every((cluster) => cluster.state === "deprecated")).toBe(true)
  })
})
