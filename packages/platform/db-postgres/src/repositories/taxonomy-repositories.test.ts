import {
  NotFoundError,
  OrganizationId,
  ProjectId,
  TaxonomyClusterId,
  TaxonomyLineageId,
  TaxonomyRunId,
} from "@domain/shared"
import {
  createTaxonomyCentroid,
  type TaxonomyCluster,
  type TaxonomyClusterLineage,
  TaxonomyClusterRepository,
  TaxonomyLineageRepository,
  type TaxonomyRun,
  TaxonomyRunRepository,
  updateTaxonomyCentroid,
} from "@domain/taxonomy"
import { Effect, Layer } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { taxonomyClusterLineage } from "../schema/taxonomy-cluster-lineage.ts"
import { taxonomyClusters } from "../schema/taxonomy-clusters.ts"
import { taxonomyRuns } from "../schema/taxonomy-runs.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { TaxonomyClusterRepositoryLive } from "./taxonomy-cluster-repository.ts"
import { TaxonomyLineageRepositoryLive } from "./taxonomy-lineage-repository.ts"
import { TaxonomyRunRepositoryLive } from "./taxonomy-run-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("x".repeat(24))
const projectId = ProjectId("p".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const vector = (values: Record<number, number>): number[] => {
  const result = new Array(2048).fill(0)
  for (const [index, value] of Object.entries(values)) result[Number(index)] = value
  return result
}

const centroidFrom = (embedding: readonly number[], timestamp = now) => {
  const centroid = createTaxonomyCentroid()
  const updated = updateTaxonomyCentroid({
    centroid: { ...centroid, clusteredAt: timestamp },
    embedding,
    weight: 1,
    timestamp,
    operation: "add",
    previousClusteredAt: timestamp,
  })
  const { clusteredAt: _clusteredAt, ...withoutAnchor } = updated
  return withoutAnchor
}

const makeCluster = (overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: TaxonomyClusterId("c".repeat(24)),
  organizationId,
  projectId,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "User requested cancellation",
  description: "The user asks to cancel an account or subscription.",
  centroid: centroidFrom(vector({ 0: 1 })),
  observationCount: 3,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: now,
  lastObservedAt: now,
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const makeRun = (overrides: Partial<TaxonomyRun> = {}): TaxonomyRun => ({
  id: TaxonomyRunId("r".repeat(24)),
  organizationId,
  projectId,
  dimension: "topic",
  trigger: "manual",
  status: "running",
  startedAt: now,
  completedAt: null,
  observationsScanned: 0,
  noiseScanned: 0,
  clustersBorn: 0,
  clustersMerged: 0,
  clustersDeprecated: 0,
  error: null,
  ...overrides,
})

const makeLineage = (overrides: Partial<TaxonomyClusterLineage> = {}): TaxonomyClusterLineage => ({
  id: TaxonomyLineageId("l".repeat(24)),
  organizationId,
  projectId,
  dimension: "topic",
  runId: TaxonomyRunId("r".repeat(24)),
  transitionType: "birth",
  fromClusterIds: [],
  toClusterIds: [TaxonomyClusterId("c".repeat(24))],
  similarity: null,
  createdAt: now,
  ...overrides,
})

const repositories = Layer.mergeAll(
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
)

const provideRepos = (database: InMemoryPostgres, org = organizationId) =>
  withPostgres(repositories, database.appPostgresClient, org)

describe("taxonomy Postgres repositories", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(taxonomyClusterLineage)
    await database.db.delete(taxonomyRuns)
    await database.db.delete(taxonomyClusters)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("saves clusters, materializes centroid vectors, and reads within the RLS organization", async () => {
    const cluster = makeCluster()

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* TaxonomyClusterRepository
        yield* repository.save(cluster)
        const found = yield* repository.findById(cluster.id)
        expect(found.name).toBe(cluster.name)
        expect(found.centroid.mass).toBeGreaterThan(0)
      }).pipe(provideRepos(database)),
    )

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* TaxonomyClusterRepository
          return yield* repository.findById(cluster.id)
        }).pipe(provideRepos(database, otherOrganizationId)),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("lists, searches nearest clusters, updates hierarchy and lifecycle", async () => {
    const first = makeCluster({ id: TaxonomyClusterId("c".repeat(24)), centroid: centroidFrom(vector({ 0: 1 })) })
    const second = makeCluster({
      id: TaxonomyClusterId("d".repeat(24)),
      name: "User praised the assistant",
      description: "The user gives positive feedback.",
      centroid: centroidFrom(vector({ 1: 1 })),
      observationCount: 1,
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* TaxonomyClusterRepository
        yield* repository.save(first)
        yield* repository.save(second)

        const nearest = yield* repository.listNearestActive({
          projectId,
          dimension: "topic",
          queryVector: vector({ 0: 1 }),
          k: 2,
        })
        expect(nearest.map((match) => match.cluster.id)).toEqual([first.id, second.id])
        expect(nearest[0]?.cosine).toBeGreaterThan(0.99)

        const page = yield* repository.list({
          projectId,
          dimension: "topic",
          state: "active",
          limit: 10,
          offset: 0,
        })
        expect(page.items.map((cluster) => cluster.id)).toEqual([first.id, second.id])

        const search = yield* repository.hybridSearch({
          projectId,
          dimension: "topic",
          query: "cancellation",
          normalizedEmbedding: vector({ 0: 1 }),
          state: "active",
          limit: 5,
          offset: 0,
        })
        expect(search[0]?.clusterId).toBe(first.id)

        yield* repository.markMerged({ clusterId: second.id, mergedIntoClusterId: first.id, timestamp: now })
        expect((yield* repository.findById(second.id)).mergedIntoClusterId).toBe(first.id)

        yield* repository.markDeprecated({ clusterId: first.id, timestamp: now })
        expect((yield* repository.findById(first.id)).state).toBe("deprecated")
      }).pipe(provideRepos(database)),
    )
  })

  it("persists runs and append-only lineage rows", async () => {
    const run = makeRun()
    const laterRun = makeRun({
      id: TaxonomyRunId("s".repeat(24)),
      status: "completed",
      startedAt: new Date("2026-05-25T00:00:00.000Z"),
      completedAt: new Date("2026-05-25T00:01:00.000Z"),
      observationsScanned: 10,
    })
    const lineage = makeLineage({ runId: run.id })

    await Effect.runPromise(
      Effect.gen(function* () {
        const runs = yield* TaxonomyRunRepository
        const lineageRepository = yield* TaxonomyLineageRepository

        yield* runs.insert(run)
        yield* runs.save(laterRun)
        expect((yield* runs.findById(run.id)).status).toBe("running")
        expect((yield* runs.findLatestByProject({ projectId, dimension: "topic" }))?.id).toBe(laterRun.id)
        expect((yield* runs.listRunning({ projectId, dimension: "topic" })).map((item) => item.id)).toEqual([run.id])

        yield* lineageRepository.appendMany([lineage])
        expect(
          (yield* lineageRepository.listRecent({ projectId, dimension: "topic", limit: 10 })).map((row) => row.id),
        ).toEqual([lineage.id])
      }).pipe(provideRepos(database)),
    )
  })
})
