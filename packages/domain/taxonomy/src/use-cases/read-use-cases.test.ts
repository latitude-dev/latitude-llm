import { AI, type AIShape, type GenerateResult } from "@domain/ai"
import {
  ChSqlClient,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  TaxonomyCategoryId,
  TaxonomyClusterId,
  TaxonomyLineageId,
  TaxonomyRunId,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { TaxonomyCategory } from "../entities/category.ts"
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
import { getLastRunUseCase, getTaxonomyAnalyticsUseCase } from "./analytics.ts"
import { getCategoryDetailsUseCase, getClusterDetailsUseCase } from "./get-details.ts"
import { listCategoriesUseCase } from "./list-categories.ts"
import { listClustersInCategoryUseCase, listClustersUseCase } from "./list-clusters.ts"
import { listObservationsInClusterUseCase } from "./list-observations-in-cluster.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")
const categoryId = TaxonomyCategoryId("c".repeat(24))

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

const makeCategory = (overrides: Partial<TaxonomyCategory> = {}): TaxonomyCategory => ({
  id: categoryId,
  organizationId,
  projectId,
  name: "Support",
  description: "Support conversations",
  centroidEmbedding: [1, 0],
  clusterCount: 1,
  observationCount: 10,
  state: "active",
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const makeObservation = (index: number, clusterId = TaxonomyClusterId("k".repeat(24))): TaxonomyObservation => ({
  organizationId,
  projectId,
  sessionId: SessionId(`session-${index}`),
  startTime: new Date(now.getTime() + index * 1000),
  endTime: new Date(now.getTime() + index * 1000 + 500),
  traceIds: [TraceId(String(index).padStart(32, "t").slice(0, 32))],
  summary: `Observation ${index}`,
  summaryHash: String(index).repeat(64).slice(0, 64),
  embedding: embedding(),
  embeddingModel: "voyage-4-large",
  assignedClusterId: clusterId,
  assignmentConfidence: 1,
  assignmentMethod: "centroid_online",
  reassignmentRunId: null,
  retentionDays: 90,
  indexedAt: now,
})

const noopAi: AIShape = {
  embed: () => Effect.succeed({ embedding: embedding() }),
  generate: <T>() => Effect.succeed({ object: {} as T, tokens: 0, duration: 0 } satisfies GenerateResult<T>),
  rerank: () => Effect.succeed([]),
}

const makeCluster = (overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: TaxonomyClusterId("k".repeat(24)),
  organizationId,
  projectId,
  parentCategoryId: categoryId,
  name: "Support questions",
  description: "Users ask support questions",
  centroid: centroid(),
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

describe("listCategoriesUseCase", () => {
  it("defaults to active non-empty categories", async () => {
    const categories = createFakeTaxonomyCategoryRepository([
      makeCategory({ id: TaxonomyCategoryId("a".repeat(24)), clusterCount: 1 }),
      makeCategory({ id: TaxonomyCategoryId("b".repeat(24)), clusterCount: 0 }),
      makeCategory({ id: TaxonomyCategoryId("d".repeat(24)), state: "deprecated" }),
    ])

    const result = await Effect.runPromise(
      listCategoriesUseCase({ organizationId, projectId }).pipe(
        Effect.provide(Layer.succeed(TaxonomyCategoryRepository, categories.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.categories.map((category) => category.id)).toEqual([TaxonomyCategoryId("a".repeat(24))])
  })

  it("can include empty categories and filter by state", async () => {
    const categories = createFakeTaxonomyCategoryRepository([
      makeCategory({ id: TaxonomyCategoryId("a".repeat(24)), clusterCount: 0 }),
      makeCategory({ id: TaxonomyCategoryId("d".repeat(24)), state: "deprecated", clusterCount: 0 }),
    ])

    const result = await Effect.runPromise(
      listCategoriesUseCase({ organizationId, projectId, state: "deprecated", includeEmpty: true }).pipe(
        Effect.provide(Layer.succeed(TaxonomyCategoryRepository, categories.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.categories.map((category) => category.id)).toEqual([TaxonomyCategoryId("d".repeat(24))])
  })
})

describe("listClustersUseCase", () => {
  it("defaults to active clusters sorted by observation count", async () => {
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: TaxonomyClusterId("a".repeat(24)), observationCount: 2 }),
      makeCluster({ id: TaxonomyClusterId("b".repeat(24)), observationCount: 8 }),
      makeCluster({ id: TaxonomyClusterId("d".repeat(24)), state: "deprecated", observationCount: 100 }),
    ])

    const result = await Effect.runPromise(
      listClustersUseCase({ organizationId, projectId }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(AI, noopAi)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.items.map((cluster) => cluster.id)).toEqual([
      TaxonomyClusterId("b".repeat(24)),
      TaxonomyClusterId("a".repeat(24)),
    ])
  })

  it("lists clusters in a category with paging", async () => {
    const otherCategoryId = TaxonomyCategoryId("o".repeat(24))
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: TaxonomyClusterId("a".repeat(24)), parentCategoryId: categoryId, observationCount: 10 }),
      makeCluster({ id: TaxonomyClusterId("b".repeat(24)), parentCategoryId: categoryId, observationCount: 8 }),
      makeCluster({ id: TaxonomyClusterId("x".repeat(24)), parentCategoryId: otherCategoryId, observationCount: 99 }),
    ])

    const result = await Effect.runPromise(
      listClustersInCategoryUseCase({ organizationId, projectId, categoryId, pageSize: 1 }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.items.map((cluster) => cluster.id)).toEqual([TaxonomyClusterId("a".repeat(24))])
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe("1")
  })

  it("runs hybrid search with a query embedding", async () => {
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({
        id: TaxonomyClusterId("a".repeat(24)),
        name: "Billing cancellation",
        description: "Cancel subscription",
      }),
      makeCluster({ id: TaxonomyClusterId("b".repeat(24)), name: "Unrelated", description: "Other topic" }),
    ])
    const ai: AIShape = {
      embed: (input) => {
        expect(input.inputType).toBe("query")
        return Effect.succeed({ embedding: embedding() })
      },
      generate: <T>() => Effect.succeed({ object: {} as T, tokens: 0, duration: 0 } satisfies GenerateResult<T>),
      rerank: () => Effect.succeed([]),
    }

    const result = await Effect.runPromise(
      listClustersUseCase({ organizationId, projectId, search: "cancel", pageSize: 1 }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(AI, ai)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.items.map((cluster) => cluster.id)).toEqual([TaxonomyClusterId("a".repeat(24))])
    expect(result.hasMore).toBe(true)
  })

  it("supports parent category filtering, explicit state, cursor, and sort options", async () => {
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: TaxonomyClusterId("a".repeat(24)), name: "Zulu", observationCount: 10 }),
      makeCluster({ id: TaxonomyClusterId("b".repeat(24)), name: "Alpha", observationCount: 8 }),
      makeCluster({ id: TaxonomyClusterId("c".repeat(24)), name: "Beta", state: "deprecated", observationCount: 100 }),
    ])

    const result = await Effect.runPromise(
      listClustersUseCase({
        organizationId,
        projectId,
        parentCategoryId: categoryId,
        state: "active",
        sort: "name_asc",
        pageSize: 1,
        cursor: "1",
      }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(AI, noopAi)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.items.map((cluster) => cluster.id)).toEqual([TaxonomyClusterId("a".repeat(24))])
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })
})

describe("details read use-cases", () => {
  it("gets cluster details with recent observation samples", async () => {
    const cluster = makeCluster()
    const clusters = createFakeTaxonomyClusterRepository([cluster])
    const observations = createFakeBehaviorObservationRepository(
      [0, 1, 2].map((index) => makeObservation(index, cluster.id)),
    )

    const result = await Effect.runPromise(
      getClusterDetailsUseCase({ organizationId, projectId, clusterId: cluster.id, sampleSize: 2 }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.cluster.id).toBe(cluster.id)
    expect(result.recentObservations).toHaveLength(2)
    expect(result.recentObservations[0]?.assignedClusterId).toBe(cluster.id)
  })

  it("gets category details with active member clusters", async () => {
    const category = makeCategory()
    const categories = createFakeTaxonomyCategoryRepository([category])
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: TaxonomyClusterId("a".repeat(24)), observationCount: 2 }),
      makeCluster({ id: TaxonomyClusterId("b".repeat(24)), observationCount: 8 }),
      makeCluster({ id: TaxonomyClusterId("d".repeat(24)), state: "deprecated", observationCount: 100 }),
    ])

    const result = await Effect.runPromise(
      getCategoryDetailsUseCase({ organizationId, projectId, categoryId }).pipe(
        Effect.provide(Layer.succeed(TaxonomyCategoryRepository, categories.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.category.id).toBe(category.id)
    expect(result.clusters.map((cluster) => cluster.id)).toEqual([
      TaxonomyClusterId("b".repeat(24)),
      TaxonomyClusterId("a".repeat(24)),
    ])
  })

  it("does not return cluster details for a different project", async () => {
    const otherProjectId = ProjectId("q".repeat(24))
    const cluster = makeCluster({ projectId: otherProjectId })
    const clusters = createFakeTaxonomyClusterRepository([cluster])
    const observations = createFakeBehaviorObservationRepository([makeObservation(9, cluster.id)])

    await expect(
      Effect.runPromise(
        getClusterDetailsUseCase({ organizationId, projectId, clusterId: cluster.id }).pipe(
          Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
          Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
          Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
          Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
        ),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError" })
  })

  it("does not return category details for a different project", async () => {
    const otherProjectId = ProjectId("q".repeat(24))
    const category = makeCategory({ projectId: otherProjectId })
    const categories = createFakeTaxonomyCategoryRepository([category])
    const clusters = createFakeTaxonomyClusterRepository([])

    await expect(
      Effect.runPromise(
        getCategoryDetailsUseCase({ organizationId, projectId, categoryId: category.id }).pipe(
          Effect.provide(Layer.succeed(TaxonomyCategoryRepository, categories.repository)),
          Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
          Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        ),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError" })
  })
})

describe("listObservationsInClusterUseCase", () => {
  it("paginates cluster observations by start time cursor", async () => {
    const clusterId = TaxonomyClusterId("k".repeat(24))
    const observations = createFakeBehaviorObservationRepository(
      [0, 1, 2].map((index) => makeObservation(index, clusterId)),
    )

    const firstPage = await Effect.runPromise(
      listObservationsInClusterUseCase({ organizationId, projectId, clusterId, pageSize: 2 }).pipe(
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(firstPage.observations.map((observation) => observation.sessionId)).toEqual([
      SessionId("session-2"),
      SessionId("session-1"),
    ])
    expect(firstPage.hasMore).toBe(true)
    expect(firstPage.nextCursor).toContain(new Date(now.getTime() + 1000).toISOString())

    const secondPage = await Effect.runPromise(
      listObservationsInClusterUseCase({
        organizationId,
        projectId,
        clusterId,
        pageSize: 2,
        ...(firstPage.nextCursor === null ? {} : { cursor: firstPage.nextCursor }),
      }).pipe(
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(secondPage.observations.map((observation) => observation.sessionId)).toEqual([SessionId("session-0")])
    expect(secondPage.hasMore).toBe(false)
    expect(secondPage.nextCursor).toBeNull()
  })

  it("does not skip observations that share a page-boundary timestamp", async () => {
    const clusterId = TaxonomyClusterId("s".repeat(24))
    const observations = createFakeBehaviorObservationRepository(
      [0, 1, 2].map((index) => ({ ...makeObservation(index, clusterId), startTime: now })),
    )

    const firstPage = await Effect.runPromise(
      listObservationsInClusterUseCase({ organizationId, projectId, clusterId, pageSize: 2 }).pipe(
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )
    const secondPage = await Effect.runPromise(
      listObservationsInClusterUseCase({
        organizationId,
        projectId,
        clusterId,
        pageSize: 2,
        ...(firstPage.nextCursor === null ? {} : { cursor: firstPage.nextCursor }),
      }).pipe(
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect([...firstPage.observations, ...secondPage.observations].map((row) => row.sessionId)).toEqual([
      SessionId("session-0"),
      SessionId("session-1"),
      SessionId("session-2"),
    ])
  })
})

describe("analytics read use-cases", () => {
  it("gets taxonomy analytics counts and top clusters", async () => {
    const categories = createFakeTaxonomyCategoryRepository([
      makeCategory({ id: TaxonomyCategoryId("a".repeat(24)) }),
      makeCategory({ id: TaxonomyCategoryId("b".repeat(24)), state: "deprecated" }),
    ])
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: TaxonomyClusterId("a".repeat(24)), observationCount: 2 }),
      makeCluster({ id: TaxonomyClusterId("b".repeat(24)), observationCount: 8 }),
      makeCluster({ id: TaxonomyClusterId("c".repeat(24)), state: "deprecated", observationCount: 20 }),
    ])
    const observations = createFakeBehaviorObservationRepository([
      makeObservation(1, TaxonomyClusterId("a".repeat(24))),
      makeObservation(2, TaxonomyClusterId("b".repeat(24))),
      makeObservation(3, TaxonomyClusterId("a".repeat(24))),
    ])

    const result = await Effect.runPromise(
      getTaxonomyAnalyticsUseCase({ organizationId, projectId, now, windowDays: 1 }).pipe(
        Effect.provide(Layer.succeed(TaxonomyCategoryRepository, categories.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.totalActiveCategories).toBe(1)
    expect(result.totalActiveClusters).toBe(2)
    expect(result.totalObservations).toBe(3)
    expect(result.topClusters.map((row) => [row.cluster.id, row.occurrences])).toEqual([
      [TaxonomyClusterId("a".repeat(24)), 2],
      [TaxonomyClusterId("b".repeat(24)), 1],
    ])
  })

  it("gets latest run and recent lineage", async () => {
    const runId = TaxonomyRunId("r".repeat(24))
    const runs = createFakeTaxonomyRunRepository([
      {
        id: runId,
        organizationId,
        projectId,
        trigger: "manual",
        status: "completed",
        startedAt: now,
        completedAt: now,
        observationsScanned: 2,
        noiseScanned: 2,
        clustersBorn: 1,
        clustersMerged: 0,
        clustersDeprecated: 0,
        categoriesRebuilt: 1,
        error: null,
      },
    ])
    const lineage = createFakeTaxonomyLineageRepository([
      {
        id: TaxonomyLineageId("d".repeat(24)),
        organizationId,
        projectId,
        runId,
        transitionType: "death",
        fromClusterIds: [TaxonomyClusterId("z".repeat(24))],
        toClusterIds: [],
        similarity: null,
        createdAt: new Date(now.getTime() + 1000),
      },
      {
        id: TaxonomyLineageId("l".repeat(24)),
        organizationId,
        projectId,
        runId,
        transitionType: "birth",
        fromClusterIds: [],
        toClusterIds: [TaxonomyClusterId("a".repeat(24))],
        similarity: null,
        createdAt: now,
      },
    ])

    const result = await Effect.runPromise(
      getLastRunUseCase({ organizationId, projectId }).pipe(
        Effect.provide(Layer.succeed(TaxonomyRunRepository, runs.repository)),
        Effect.provide(Layer.succeed(TaxonomyLineageRepository, lineage.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.run?.id).toBe(runId)
    expect(result.lineage.map((row) => row.transitionType)).toEqual(["birth"])
  })
})
