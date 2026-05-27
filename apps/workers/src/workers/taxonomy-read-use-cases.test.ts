import { AI, type AIShape, type GenerateResult } from "@domain/ai"
import {
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyCategoryId,
  TaxonomyClusterId,
  TaxonomyLineageId,
  TaxonomyRunId,
  TraceId,
} from "@domain/shared"
import {
  BehaviorObservationRepository,
  createTaxonomyCentroid,
  getCategoryDetailsUseCase,
  getClusterDetailsUseCase,
  getLastRunUseCase,
  getTaxonomyAnalyticsUseCase,
  listCategoriesUseCase,
  listClustersInCategoryUseCase,
  listClustersUseCase,
  listObservationsInClusterUseCase,
  type TaxonomyCategory,
  TaxonomyCategoryRepository,
  type TaxonomyCluster,
  TaxonomyClusterRepository,
  TaxonomyLineageRepository,
  type TaxonomyObservation,
  TaxonomyRunRepository,
  updateTaxonomyCentroid,
} from "@domain/taxonomy"
import { BehaviorObservationRepositoryLive, type ClickHouseClient, withClickHouse } from "@platform/db-clickhouse"
import {
  TaxonomyCategoryRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("s".repeat(24))
const categoryId = TaxonomyCategoryId("c".repeat(24))
const clusterId = TaxonomyClusterId("a".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const embedding = () => {
  const vector = new Array(2048).fill(0)
  vector[0] = 1
  return vector
}

const centroid = () => {
  const base = createTaxonomyCentroid()
  const updated = updateTaxonomyCentroid({
    centroid: { ...base, clusteredAt: now },
    embedding: embedding(),
    weight: 1,
    operation: "add",
    timestamp: now,
    previousClusteredAt: now,
  })
  const { clusteredAt: _clusteredAt, ...withoutAnchor } = updated
  return withoutAnchor
}

const category: TaxonomyCategory = {
  id: categoryId,
  organizationId,
  projectId,
  name: "Cancellation",
  description: "Cancellation requests",
  centroidEmbedding: embedding(),
  clusterCount: 1,
  observationCount: 2,
  state: "active",
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
}

const cluster: TaxonomyCluster = {
  id: clusterId,
  organizationId,
  projectId,
  parentCategoryId: categoryId,
  name: "Billing cancellation",
  description: "Users ask to cancel subscriptions.",
  centroid: centroid(),
  observationCount: 2,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: now,
  lastObservedAt: now,
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
}

const observation = (index: number): TaxonomyObservation => ({
  organizationId,
  projectId,
  sessionId: SessionId(`read-session-${index}`),
  startTime: new Date(now.getTime() - index * 60_000),
  endTime: new Date(now.getTime() - index * 60_000 + 1000),
  traceIds: [TraceId(String(index).padStart(32, "t").slice(0, 32))],
  summary: `Cancellation observation ${index}`,
  summaryHash: String(index).repeat(64).slice(0, 64),
  embedding: embedding(),
  embeddingModel: "voyage-4-large",
  assignedClusterId: clusterId,
  assignmentConfidence: 1,
  assignmentMethod: "centroid_online",
  reassignmentRunId: runId,
  retentionDays: 90,
  indexedAt: now,
})

const ai: AIShape = {
  embed: (input) => {
    expect(input.inputType).toBe("query")
    return Effect.succeed({ embedding: embedding() })
  },
  generate: <T>() => Effect.succeed({ object: {} as T, tokens: 0, duration: 0 } satisfies GenerateResult<T>),
  rerank: () => Effect.succeed([]),
}

const pgLayer = Layer.mergeAll(
  TaxonomyCategoryRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
)

const seed = () =>
  Effect.gen(function* () {
    const categories = yield* TaxonomyCategoryRepository
    const clusters = yield* TaxonomyClusterRepository
    const runs = yield* TaxonomyRunRepository
    const lineage = yield* TaxonomyLineageRepository
    yield* categories.save(category)
    yield* clusters.save(cluster)
    yield* runs.save({
      id: runId,
      organizationId,
      projectId,
      trigger: "manual",
      status: "completed",
      startedAt: now,
      completedAt: now,
      observationsScanned: 2,
      noiseScanned: 0,
      clustersBorn: 1,
      clustersMerged: 0,
      clustersDeprecated: 0,
      categoriesRebuilt: 1,
      error: null,
    })
    yield* lineage.appendMany([
      {
        id: TaxonomyLineageId("l".repeat(24)),
        organizationId,
        projectId,
        runId,
        transitionType: "birth",
        fromClusterIds: [],
        toClusterIds: [clusterId],
        similarity: null,
        createdAt: now,
      },
    ])
  }).pipe(withPostgres(pgLayer, pg.appPostgresClient, organizationId))

const seedObservations = () =>
  Effect.gen(function* () {
    const observations = yield* BehaviorObservationRepository
    yield* observations.upsert(observation(0))
    yield* observations.upsert(observation(1))
  }).pipe(withClickHouse(BehaviorObservationRepositoryLive, ch.client as ClickHouseClient, organizationId))

describe("taxonomy read use-cases integration", () => {
  it("covers every P5 read use-case against PGlite and chdb-backed repositories", async () => {
    await Effect.runPromise(seed())
    await Effect.runPromise(seedObservations())

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return {
          categories: yield* listCategoriesUseCase({ organizationId, projectId }),
          clustersInCategory: yield* listClustersInCategoryUseCase({ organizationId, projectId, categoryId }),
          clusters: yield* listClustersUseCase({ organizationId, projectId }),
          searchClusters: yield* listClustersUseCase({ organizationId, projectId, search: "cancel" }),
          clusterDetails: yield* getClusterDetailsUseCase({ organizationId, projectId, clusterId }),
          categoryDetails: yield* getCategoryDetailsUseCase({ organizationId, projectId, categoryId }),
          observations: yield* listObservationsInClusterUseCase({ organizationId, projectId, clusterId, pageSize: 1 }),
          analytics: yield* getTaxonomyAnalyticsUseCase({ organizationId, projectId, windowDays: 1, now }),
          lastRun: yield* getLastRunUseCase({ organizationId, projectId }),
        }
      }).pipe(
        withPostgres(pgLayer, pg.appPostgresClient, organizationId),
        withClickHouse(BehaviorObservationRepositoryLive, ch.client as ClickHouseClient, organizationId),
        Effect.provide(Layer.succeed(AI, ai)),
      ),
    )

    expect(result.categories.categories.map((row) => row.id)).toContain(categoryId)
    expect(result.clustersInCategory.items.map((row) => row.id)).toContain(clusterId)
    expect(result.clusters.items.map((row) => row.id)).toContain(clusterId)
    expect(result.searchClusters.items.map((row) => row.id)).toContain(clusterId)
    expect(result.clusterDetails.cluster.id).toBe(clusterId)
    expect(result.clusterDetails.recentObservations).toHaveLength(2)
    expect(result.categoryDetails.category.id).toBe(categoryId)
    expect(result.categoryDetails.clusters.map((row) => row.id)).toContain(clusterId)
    expect(result.observations.observations).toHaveLength(1)
    expect(result.observations.hasMore).toBe(true)
    expect(result.analytics.totalActiveCategories).toBeGreaterThanOrEqual(1)
    expect(result.analytics.topClusters[0]?.cluster.id).toBe(clusterId)
    expect(result.lastRun.run?.id).toBe(runId)
    expect(result.lastRun.lineage.map((row) => row.transitionType)).toEqual(["birth"])
  })
})
