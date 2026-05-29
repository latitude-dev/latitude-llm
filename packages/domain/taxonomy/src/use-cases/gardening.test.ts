import { AI, type AIShape, type GenerateInput, type GenerateResult } from "@domain/ai"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import {
  ChSqlClient,
  DistributedLockRepository,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  TaxonomyRunId,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { TAXONOMY_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyObservation } from "../entities/observation.ts"
import { createTaxonomyCentroid, updateTaxonomyCentroid } from "../helpers.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyCategoryRepository } from "../ports/taxonomy-category-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyLineageRepository } from "../ports/taxonomy-lineage-repository.ts"
import { TaxonomyRunRepository } from "../ports/taxonomy-run-repository.ts"
import { createFakeBehaviorObservationRepository } from "../testing/fake-behavior-observation-repository.ts"
import { createFakeTaxonomyCategoryRepository } from "../testing/fake-taxonomy-category-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyLineageRepository } from "../testing/fake-taxonomy-lineage-repository.ts"
import { createFakeTaxonomyRunRepository } from "../testing/fake-taxonomy-run-repository.ts"
import { deprecateInactiveClustersUseCase } from "./deprecate-inactive-clusters.ts"
import { emitLineageUseCase } from "./emit-lineage.ts"
import { mergeNearDuplicateClustersUseCase } from "./merge-near-duplicate-clusters.ts"
import { nameCategoryUseCase, nameClusterUseCase } from "./name-taxonomy.ts"
import { reassignNoiseToCurrentClustersUseCase } from "./reassign-noise-to-current-clusters.ts"
import { rebuildCategoryHierarchyUseCase } from "./rebuild-category-hierarchy.ts"
import { runProjectGardeningUseCase } from "./run-project-gardening.ts"
import { computeBirthMinMembers, sweepNoiseAndBirthClustersUseCase } from "./sweep-noise-and-birth-clusters.ts"
import { taxonomyGardenProjectDedupeKey, triggerProjectGardeningUseCase } from "./trigger-project-gardening.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const vector = (values: Record<number, number>) => {
  const result = new Array(TAXONOMY_EMBEDDING_DIMENSIONS).fill(0)
  for (const [index, value] of Object.entries(values)) result[Number(index)] = value
  return result
}

const makeObservation = (index: number, embedding = vector({ 0: 1 })): TaxonomyObservation => ({
  organizationId,
  projectId,
  sessionId: SessionId(`session-${index}`),
  startTime: new Date(now.getTime() + index * 1000),
  endTime: new Date(now.getTime() + index * 1000 + 500),
  traceIds: [TraceId(String(index).padStart(32, "a").slice(0, 32))],
  summary: `Observation ${index}`,
  summaryHash: String(index).repeat(64).slice(0, 64),
  embedding,
  embeddingModel: "voyage-4-large",
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: 90,
  indexedAt: now,
})

const centroidFrom = (embedding: readonly number[]) => {
  const centroid = createTaxonomyCentroid()
  const updated = updateTaxonomyCentroid({
    centroid: { ...centroid, clusteredAt: now },
    embedding,
    weight: 1,
    timestamp: now,
    operation: "add",
    previousClusteredAt: now,
  })
  const { clusteredAt: _clusteredAt, ...withoutAnchor } = updated
  return withoutAnchor
}

const makeCluster = (overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: "c".repeat(24) as TaxonomyCluster["id"],
  organizationId,
  projectId,
  parentCategoryId: null,
  name: "Existing cancellation",
  description: "Users cancel subscriptions.",
  centroid: centroidFrom(vector({ 0: 1 })),
  observationCount: 10,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: now,
  lastObservedAt: now,
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const runUseCase = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    BehaviorObservationRepository | TaxonomyClusterRepository | DistributedLockRepository | SqlClient | ChSqlClient
  >,
  observations: ReturnType<typeof createFakeBehaviorObservationRepository>,
  clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    ),
  )

const createDeterministicAi = (): AIShape => ({
  generate: <T>(input: GenerateInput<T>) =>
    Effect.sync((): GenerateResult<T> => {
      const raw = input.system.includes("proposeCandidateThemes")
        ? { candidates: [{ theme: "deterministic theme", examples: [0] }] }
        : {
            name: input.system.includes("category") ? "Named category" : "Named cluster",
            description: "A deterministic long enough generated description.",
          }
      return { object: input.schema.parse(raw), tokens: 1, duration: 1 }
    }),
  embed: () => Effect.succeed({ embedding: [] }),
  rerank: () => Effect.succeed([]),
})

describe("gardening use-cases", () => {
  it("computes the proportional birth member floor", () => {
    expect(computeBirthMinMembers(250)).toBe(4)
    expect(computeBirthMinMembers(10_000)).toBe(30)
  })

  it("births a cluster from dense noise and reassigns members", async () => {
    const observations = createFakeBehaviorObservationRepository([0, 1, 2, 3].map((index) => makeObservation(index)))
    const clusters = createFakeTaxonomyClusterRepository([])

    const result = await runUseCase(
      sweepNoiseAndBirthClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersBorn).toBe(1)
    expect(result.lineage).toHaveLength(1)
    expect([...clusters.clusters.values()]).toHaveLength(1)
    expect([...observations.rows.values()].every((row) => row.assignmentMethod === "gardening_birth")).toBe(true)
  })

  it("merges near-duplicate clusters and reassigns loser observations", async () => {
    const survivor = makeCluster({ id: "c".repeat(24) as TaxonomyCluster["id"], observationCount: 2_000 })
    const loser = makeCluster({ id: "d".repeat(24) as TaxonomyCluster["id"], observationCount: 1_001 })
    const loserObservations = Array.from({ length: 1_001 }, (_, index) => ({
      ...makeObservation(index),
      startTime: now,
      assignedClusterId: loser.id,
      assignmentMethod: "centroid_online" as const,
    }))
    const observations = createFakeBehaviorObservationRepository(loserObservations)
    const clusters = createFakeTaxonomyClusterRepository([survivor, loser])

    const result = await runUseCase(
      mergeNearDuplicateClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersMerged).toBe(1)
    expect(result.observationsReassigned).toBe(1_001)
    expect(result.lineage.map((row) => row.transitionType)).toEqual(["merge"])
    expect(clusters.clusters.get(loser.id)?.state).toBe("merged")
    expect([...observations.rows.values()][0]?.assignedClusterId).toBe(survivor.id)
    expect([...observations.rows.values()].filter((row) => row.assignedClusterId === survivor.id)).toHaveLength(1_001)
    expect(clusters.clusters.get(survivor.id)?.observationCount).toBe(3_001)
  })

  it("deprecates inactive clusters whose decayed mass is below the floor", async () => {
    const staleLowMass = makeCluster({
      id: "e".repeat(24) as TaxonomyCluster["id"],
      centroid: { ...centroidFrom(vector({ 0: 1 })), mass: 0.4 },
      lastObservedAt: new Date("2026-04-01T00:00:00.000Z"),
      clusteredAt: new Date("2026-04-01T00:00:00.000Z"),
    })
    const staleHighMass = makeCluster({
      id: "f".repeat(24) as TaxonomyCluster["id"],
      centroid: { ...centroidFrom(vector({ 0: 1 })), mass: 10 },
      lastObservedAt: new Date("2026-04-01T00:00:00.000Z"),
      clusteredAt: new Date("2026-05-23T00:00:00.000Z"),
    })
    const recentlyObserved = makeCluster({ id: "g".repeat(24) as TaxonomyCluster["id"], lastObservedAt: now })
    const observations = createFakeBehaviorObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([staleLowMass, staleHighMass, recentlyObserved])

    const result = await runUseCase(
      deprecateInactiveClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersDeprecated).toBe(1)
    expect(result.lineage.map((row) => row.transitionType)).toEqual(["death"])
    expect(clusters.clusters.get(staleLowMass.id)?.state).toBe("deprecated")
    expect(clusters.clusters.get(staleHighMass.id)?.state).toBe("active")
    expect(clusters.clusters.get(recentlyObserved.id)?.state).toBe("active")
  })

  it("reassigns recent noise to current clusters using the two-gate assignment", async () => {
    const matching = makeObservation(20, vector({ 0: 1 }))
    const unrelated = makeObservation(21, vector({ 1: 1 }))
    const observations = createFakeBehaviorObservationRepository([matching, unrelated])
    const clusters = createFakeTaxonomyClusterRepository([makeCluster()])

    const result = await runUseCase(
      reassignNoiseToCurrentClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result).toEqual({ noiseScanned: 2, observationsReassigned: 1 })
    expect(observations.rows.get(`${organizationId}|${projectId}|${matching.sessionId}`)?.assignmentMethod).toBe(
      "gardening_reassign",
    )
    expect(observations.rows.get(`${organizationId}|${projectId}|${unrelated.sessionId}`)?.assignmentMethod).toBe(
      "noise",
    )
    expect(clusters.clusters.get("c".repeat(24) as TaxonomyCluster["id"])?.observationCount).toBe(11)
  })

  it("rebuilds category hierarchy, assigns parent categories, and deprecates orphan categories", async () => {
    const billingCategoryId = "b".repeat(24) as ReturnType<typeof makeCluster>["parentCategoryId"] extends infer T
      ? NonNullable<T>
      : never
    const oldCategoryId = "z".repeat(24) as typeof billingCategoryId
    const billingCluster = makeCluster({
      id: "h".repeat(24) as TaxonomyCluster["id"],
      centroid: centroidFrom(vector({ 0: 1 })),
    })
    const feedbackCluster = makeCluster({
      id: "i".repeat(24) as TaxonomyCluster["id"],
      centroid: centroidFrom(vector({ 1: 1 })),
    })
    const clusters = createFakeTaxonomyClusterRepository([billingCluster, feedbackCluster])
    const categories = createFakeTaxonomyCategoryRepository([
      {
        id: billingCategoryId,
        organizationId,
        projectId,
        name: "Billing",
        description: "Billing topics",
        centroidEmbedding: vector({ 0: 1 }),
        clusterCount: 1,
        observationCount: 10,
        state: "active",
        clusteredAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: oldCategoryId,
        organizationId,
        projectId,
        name: "Old",
        description: "Old category",
        centroidEmbedding: vector({ 200: 1 }),
        clusterCount: 1,
        observationCount: 1,
        state: "active",
        clusteredAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ])

    const result = await Effect.runPromise(
      rebuildCategoryHierarchyUseCase({ organizationId, projectId, now }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyCategoryRepository, categories.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.clustersAssigned).toBe(2)
    expect(clusters.clusters.get(billingCluster.id)?.parentCategoryId).toBe(billingCategoryId)
    expect(clusters.clusters.get(feedbackCluster.id)?.parentCategoryId).not.toBe(billingCategoryId)
    expect(clusters.clusters.get(feedbackCluster.id)?.parentCategoryId).toBeTruthy()
    expect(categories.categories.get(oldCategoryId)?.state).toBe("deprecated")
    expect([...categories.categories.values()].filter((category) => category.state === "active")).toHaveLength(2)
  })

  it("names clusters and categories with deterministic AI map-reduce calls", async () => {
    const categoryId = "n".repeat(24) as NonNullable<TaxonomyCluster["parentCategoryId"]>
    const cluster = makeCluster({
      id: "j".repeat(24) as TaxonomyCluster["id"],
      name: "Pending",
      parentCategoryId: categoryId,
    })
    const observations = createFakeBehaviorObservationRepository(
      [0, 1, 2, 3].map((index) => ({
        ...makeObservation(index, vector({ [index]: 1 })),
        assignedClusterId: cluster.id,
        summary: `sample ${index}`,
      })),
    )
    const clusters = createFakeTaxonomyClusterRepository([cluster])
    const categories = createFakeTaxonomyCategoryRepository([
      {
        id: categoryId,
        organizationId,
        projectId,
        name: "Pending",
        description: "",
        centroidEmbedding: vector({ 0: 1 }),
        clusterCount: 1,
        observationCount: 4,
        state: "active",
        clusteredAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ])
    let calls = 0
    const ai: AIShape = {
      generate: <T>(input: GenerateInput<T>) =>
        Effect.sync((): GenerateResult<T> => {
          calls++
          const raw = input.system.includes("proposeCandidateThemes")
            ? { candidates: [{ theme: "deterministic theme", examples: [0] }] }
            : {
                name: input.system.includes("category") ? "Named category" : "Named cluster",
                description: "A deterministic long enough generated description.",
              }
          return { object: input.schema.parse(raw), tokens: 1, duration: 1 }
        }),
      embed: () => Effect.succeed({ embedding: [] }),
      rerank: () => Effect.succeed([]),
    }

    await Effect.runPromise(
      nameClusterUseCase({ organizationId, projectId, clusterId: cluster.id, now }).pipe(
        Effect.provide(Layer.succeed(AI, ai)),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )
    await Effect.runPromise(
      nameCategoryUseCase({ organizationId, projectId, categoryId, now }).pipe(
        Effect.provide(Layer.succeed(AI, ai)),
        Effect.provide(Layer.succeed(TaxonomyCategoryRepository, categories.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(calls).toBe(3)
    expect(clusters.clusters.get(cluster.id)?.name).toBe("Named cluster")
    expect(categories.categories.get(categoryId)?.name).toBe("Named category")
  })

  it("orchestrates a project gardening run through activities and closes the run", async () => {
    const assignedObservation = {
      ...makeObservation(4),
      assignedClusterId: "existing-cluster" as TaxonomyCluster["id"],
      assignmentMethod: "centroid_online" as const,
      assignmentConfidence: 0.9,
    }
    const observations = createFakeBehaviorObservationRepository([
      ...[0, 1, 2, 3].map((index) => makeObservation(index)),
      assignedObservation,
    ])
    const clusters = createFakeTaxonomyClusterRepository([])
    const categories = createFakeTaxonomyCategoryRepository([])
    const lineage = createFakeTaxonomyLineageRepository()
    const runs = createFakeTaxonomyRunRepository()

    const result = await Effect.runPromise(
      runProjectGardeningUseCase({ organizationId, projectId, trigger: "manual", now }).pipe(
        Effect.provide(Layer.succeed(AI, createDeterministicAi())),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyCategoryRepository, categories.repository)),
        Effect.provide(Layer.succeed(TaxonomyLineageRepository, lineage.repository)),
        Effect.provide(Layer.succeed(TaxonomyRunRepository, runs.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.status).toBe("completed")
    expect(result.observationsScanned).toBe(5)
    expect(result.noiseScanned).toBe(4)
    expect(result.clustersBorn).toBe(1)
    expect(result.categoriesRebuilt).toBe(1)
    expect([...runs.runs.values()][0]?.status).toBe("completed")
    expect(lineage.rows.map((row) => row.transitionType)).toEqual(["birth"])
    expect([...clusters.clusters.values()][0]?.name).toBe("Named cluster")
    expect([...categories.categories.values()][0]?.name).toBe("Named category")
  })

  it("manual trigger publishes gardenProject with org-scoped throttle key", async () => {
    const queue = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      triggerProjectGardeningUseCase({ organizationId, projectId, reason: "manual" }).pipe(
        Effect.provide(Layer.succeed(QueuePublisher, queue.publisher)),
      ),
    )

    expect(result).toEqual({ queued: true })
    expect(queue.published).toHaveLength(1)
    expect(queue.published[0]).toMatchObject({
      queue: "taxonomy",
      task: "gardenProject",
      payload: { organizationId, projectId, reason: "manual" },
      options: { dedupeKey: taxonomyGardenProjectDedupeKey({ organizationId, projectId }) },
    })
  })

  it("emits lineage rows returned by gardening activities", async () => {
    const observations = createFakeBehaviorObservationRepository([0, 1, 2, 3].map((index) => makeObservation(index)))
    const clusters = createFakeTaxonomyClusterRepository([])
    const lineage = createFakeTaxonomyLineageRepository()

    const sweepResult = await runUseCase(
      sweepNoiseAndBirthClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )
    const emitResult = await Effect.runPromise(
      emitLineageUseCase({ transitions: sweepResult.lineage }).pipe(
        Effect.provide(Layer.succeed(TaxonomyLineageRepository, lineage.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(emitResult).toEqual({ emitted: 1 })
    expect(lineage.rows.map((row) => row.transitionType)).toEqual(["birth"])
  })

  it("absorbs dense noise into an existing active cluster instead of birthing", async () => {
    const observations = createFakeBehaviorObservationRepository([0, 1, 2, 3].map((index) => makeObservation(index)))
    const clusters = createFakeTaxonomyClusterRepository([makeCluster()])

    const result = await runUseCase(
      sweepNoiseAndBirthClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersBorn).toBe(0)
    expect(result.observationsAbsorbed).toBe(4)
    expect(result.lineage).toHaveLength(0)
    expect([...clusters.clusters.values()]).toHaveLength(1)
    expect([...observations.rows.values()].every((row) => row.assignmentMethod === "gardening_reassign")).toBe(true)
  })
})
