import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import {
  ChSqlClient,
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
import type { ClusteringTreeNode } from "../clustering.ts"
import { TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { createTaxonomyCentroid, updateTaxonomyCentroid } from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import {
  buildHierarchicalTaxonomyUseCase,
  computeSplitLinkThreshold,
  planHierarchicalTaxonomyUseCase,
} from "./build-hierarchical-taxonomy.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const vector = (values: Record<number, number>) => {
  const result = new Array(EMBEDDING_DIMENSIONS).fill(0)
  for (const [index, value] of Object.entries(values)) result[Number(index)] = value
  return result
}

const E1 = vector({ 0: 1 })
const E2 = vector({ 1: 1 })

describe("computeSplitLinkThreshold", () => {
  const childNode = (centroid: readonly number[]): ClusteringTreeNode => ({
    memberIndices: [],
    centroid,
    children: [],
    depth: 1,
  })

  it("returns null for fewer than two children", () => {
    expect(computeSplitLinkThreshold([])).toBeNull()
    expect(computeSplitLinkThreshold([childNode(E1)])).toBeNull()
  })

  it("clamps a negative min similarity to 0 (schema contract is [0, 1])", () => {
    // Opposite unit centroids give cosine similarity -1; the stored contract is
    // z.number().min(0), so the raw value must be clamped rather than persisted.
    const threshold = computeSplitLinkThreshold([childNode(E1), childNode(vector({ 0: -1 }))])
    expect(threshold).toBe(0)
  })

  it("keeps an in-range similarity and never exceeds 1", () => {
    expect(computeSplitLinkThreshold([childNode(E1), childNode(E2)])).toBe(0)
    expect(computeSplitLinkThreshold([childNode(E1), childNode(E1)])).toBe(1)
  })
})

const makeObservation = (index: number, embedding: readonly number[], at: Date): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Observation ${index}` },
  embedding: [...embedding],
  startTime: new Date(at.getTime() + index * 1000),
  endTime: new Date(at.getTime() + index * 1000 + 500),
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: 90,
  indexedAt: new Date(at.getTime() - 60_000),
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
  customBehaviorId: null,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "Existing topic",
  description: "An existing topic.",
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
  observations: ReturnType<typeof createFakeTaxonomyObservationRepository>,
  clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>,
  now: Date,
) =>
  Effect.runPromise(
    buildHierarchicalTaxonomyUseCase({
      organizationId,
      projectId,
      runId: TaxonomyRunId("r".repeat(24)),
      dimension: "topic",
      now,
    }).pipe(
      Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    ),
  )

describe("buildHierarchicalTaxonomyUseCase continuity matching", () => {
  it("reuses the cluster id across passes when the topic is unchanged", async () => {
    const pass1At = new Date("2026-05-24T12:00:00.000Z")
    const observations = createFakeTaxonomyObservationRepository(
      Array.from({ length: 20 }, (_, index) => makeObservation(index, E1, pass1At)),
    )
    const clusters = createFakeTaxonomyClusterRepository([])

    const first = await runBuild(observations, clusters, pass1At)
    expect(first.clustersBorn).toBe(1)
    expect(first.clustersContinued).toBe(0)
    const firstCluster = [...clusters.clusters.values()][0]
    expect(firstCluster).toBeDefined()
    const firstId = firstCluster?.id

    // Second pass over the same observations: the matcher must recognise the
    // single root as the same topic and reuse its id.
    const pass2At = new Date("2026-05-24T18:00:00.000Z")
    const second = await runBuild(observations, clusters, pass2At)

    expect(second.clustersContinued).toBe(1)
    expect(second.clustersBorn).toBe(0)
    expect(second.clustersDeprecated).toBe(0)
    expect(second.lineage.map((row) => row.transitionType)).toEqual(["continuation"])
    expect(second.lineage[0]?.toClusterIds).toEqual([firstId])
    expect(second.lineage[0]?.fromClusterIds).toEqual([firstId])

    expect([...clusters.clusters.values()]).toHaveLength(1)
    const secondCluster = clusters.clusters.get(firstId as TaxonomyClusterId)
    expect(secondCluster?.state).toBe("active")
    // Age is preserved across the rebuild.
    expect(secondCluster?.firstObservedAt).toEqual(firstCluster?.firstObservedAt)
  })

  it("births a fresh cluster and deprecates the old one when the topic changed", async () => {
    const old = makeCluster({
      id: "a".repeat(24) as TaxonomyClusterId,
      centroid: centroidFrom(E1, new Date("2026-01-01T00:00:00.000Z")),
    })
    const now = new Date("2026-05-24T12:00:00.000Z")
    // The live window now contains a completely different topic (orthogonal E2).
    const observations = createFakeTaxonomyObservationRepository(
      Array.from({ length: 20 }, (_, index) => makeObservation(index, E2, now)),
    )
    const clusters = createFakeTaxonomyClusterRepository([old])

    const result = await runBuild(observations, clusters, now)

    expect(result.clustersBorn).toBe(1)
    expect(result.clustersContinued).toBe(0)
    expect(result.clustersDeprecated).toBe(1)
    const transitions = result.lineage.map((row) => row.transitionType).sort()
    expect(transitions).toEqual(["birth", "death"])
    expect(clusters.clusters.get("a".repeat(24) as TaxonomyClusterId)?.state).toBe("deprecated")
  })

  it("reads small corpora whole and applies the system sample cap to large corpora", async () => {
    const now = new Date("2026-05-24T12:00:00.000Z")
    const total = 2_000
    const observations = createFakeTaxonomyObservationRepository(
      Array.from({ length: total }, (_, index) => makeObservation(index, E1, now)),
    )
    const clusters = createFakeTaxonomyClusterRepository([])

    const result = await Effect.runPromise(
      planHierarchicalTaxonomyUseCase({
        organizationId,
        projectId,
        runId: TaxonomyRunId("r".repeat(24)),
        dimension: "topic",
        now,
        clusterBuilder: (input) =>
          Effect.succeed({
            memberIndices: input.embeddings.map((_, index) => index),
            centroid: input.embeddings[0] ?? [],
            children: [],
            depth: 0,
          }),
      }).pipe(
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.observationsAvailable).toBe(total)
    expect(result.observationsSampled).toBe(TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX)
    expect(result.sampleCap).toBe(TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX)
  })
})
