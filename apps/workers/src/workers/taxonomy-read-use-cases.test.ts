import { AI, type AIShape, type GenerateResult } from "@domain/ai"
import {
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
  TaxonomyLineageId,
  TaxonomyRunId,
} from "@domain/shared"
import {
  createTaxonomyCentroid,
  getClusterDetailsUseCase,
  getLastRunUseCase,
  getTaxonomyAnalyticsUseCase,
  listClustersUseCase,
  listObservationsInClusterUseCase,
  type TaxonomyCluster,
  TaxonomyClusterRepository,
  TaxonomyLineageRepository,
  type TaxonomyMomentObservation,
  TaxonomyObservationRepository,
  TaxonomyRunRepository,
  updateTaxonomyCentroid,
} from "@domain/taxonomy"
import { type ClickHouseClient, TaxonomyObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
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

const cluster: TaxonomyCluster = {
  id: clusterId,
  organizationId,
  projectId,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
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

const observation = (index: number): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`read-session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Cancellation observation ${index}` },
  embedding: embedding(),
  startTime: new Date(now.getTime() - index * 60_000),
  endTime: new Date(now.getTime() - index * 60_000 + 1000),
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

const pgLayer = Layer.mergeAll(TaxonomyClusterRepositoryLive, TaxonomyLineageRepositoryLive, TaxonomyRunRepositoryLive)

const seed = () =>
  Effect.gen(function* () {
    const clusters = yield* TaxonomyClusterRepository
    const runs = yield* TaxonomyRunRepository
    const lineage = yield* TaxonomyLineageRepository
    yield* clusters.save(cluster)
    yield* runs.save({
      id: runId,
      organizationId,
      projectId,
      dimension: "topic",
      trigger: "manual",
      status: "completed",
      startedAt: now,
      completedAt: now,
      observationsScanned: 2,
      noiseScanned: 0,
      clustersBorn: 1,
      clustersMerged: 0,
      clustersDeprecated: 0,
      error: null,
    })
    yield* lineage.appendMany([
      {
        id: TaxonomyLineageId("l".repeat(24)),
        organizationId,
        projectId,
        dimension: "topic",
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
    const observations = yield* TaxonomyObservationRepository
    yield* observations.upsert(observation(0))
    yield* observations.upsert(observation(1))
  }).pipe(withClickHouse(TaxonomyObservationRepositoryLive, ch.client as ClickHouseClient, organizationId))

describe("taxonomy read use-cases integration", () => {
  it("covers every P5 read use-case against PGlite and chdb-backed repositories", async () => {
    await Effect.runPromise(seed())
    await Effect.runPromise(seedObservations())

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return {
          clusters: yield* listClustersUseCase({ organizationId, projectId }),
          searchClusters: yield* listClustersUseCase({ organizationId, projectId, search: "cancel" }),
          clusterDetails: yield* getClusterDetailsUseCase({ organizationId, projectId, clusterId }),
          observations: yield* listObservationsInClusterUseCase({ organizationId, projectId, clusterId, pageSize: 1 }),
          analytics: yield* getTaxonomyAnalyticsUseCase({ organizationId, projectId, windowDays: 1, now }),
          lastRun: yield* getLastRunUseCase({ organizationId, projectId }),
        }
      }).pipe(
        withPostgres(pgLayer, pg.appPostgresClient, organizationId),
        withClickHouse(TaxonomyObservationRepositoryLive, ch.client as ClickHouseClient, organizationId),
        Effect.provide(Layer.succeed(AI, ai)),
      ),
    )

    expect(result.clusters.items.map((row) => row.id)).toContain(clusterId)
    expect(result.searchClusters.items.map((row) => row.id)).toContain(clusterId)
    expect(result.clusterDetails.cluster.id).toBe(clusterId)
    expect(result.clusterDetails.recentObservations).toHaveLength(2)
    expect(result.observations.observations).toHaveLength(1)
    expect(result.observations.hasMore).toBe(true)
    expect(result.analytics.topClusters[0]?.cluster.id).toBe(clusterId)
    expect(result.lastRun.run?.id).toBe(runId)
    expect(result.lastRun.lineage.map((row) => row.transitionType)).toEqual(["birth"])
  })
})
