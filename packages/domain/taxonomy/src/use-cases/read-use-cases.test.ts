import { AI, type AIShape, type GenerateResult } from "@domain/ai"
import {
  ChSqlClient,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  TaxonomyClusterId,
  TaxonomyLineageId,
  TaxonomyRunId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { createTaxonomyCentroid, updateTaxonomyCentroid } from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyLineageRepository } from "../ports/taxonomy-lineage-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { TaxonomyRunRepository } from "../ports/taxonomy-run-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyLineageRepository } from "../testing/fake-taxonomy-lineage-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import { createFakeTaxonomyRunRepository } from "../testing/fake-taxonomy-run-repository.ts"
import { getLastRunUseCase, getTaxonomyAnalyticsUseCase } from "./analytics.ts"
import { getClusterDetailsUseCase } from "./get-details.ts"
import { listClustersUseCase } from "./list-clusters.ts"
import { listObservationsInClusterUseCase } from "./list-observations-in-cluster.ts"
import { listProjectBehavioursUseCase } from "./list-project-behaviours.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
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

const makeObservation = (index: number, clusterId = TaxonomyClusterId("k".repeat(24))): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Observation ${index}` },
  embedding: embedding(),
  startTime: new Date(now.getTime() + index * 1000),
  endTime: new Date(now.getTime() + index * 1000 + 500),
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
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
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
})

describe("details read use-cases", () => {
  it("gets cluster details with recent observation samples", async () => {
    const cluster = makeCluster()
    const clusters = createFakeTaxonomyClusterRepository([cluster])
    const observations = createFakeTaxonomyObservationRepository(
      [0, 1, 2].map((index) => makeObservation(index, cluster.id)),
    )

    const result = await Effect.runPromise(
      getClusterDetailsUseCase({ organizationId, projectId, clusterId: cluster.id, sampleSize: 2 }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.cluster.id).toBe(cluster.id)
    expect(result.recentObservations).toHaveLength(2)
    expect(result.recentObservations[0]?.assignedClusterId).toBe(cluster.id)
  })

  it("does not return cluster details for a different project", async () => {
    const otherProjectId = ProjectId("q".repeat(24))
    const cluster = makeCluster({ projectId: otherProjectId })
    const clusters = createFakeTaxonomyClusterRepository([cluster])
    const observations = createFakeTaxonomyObservationRepository([makeObservation(9, cluster.id)])

    await expect(
      Effect.runPromise(
        getClusterDetailsUseCase({ organizationId, projectId, clusterId: cluster.id }).pipe(
          Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
          Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
          Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
          Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
        ),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError" })
  })
})

describe("listObservationsInClusterUseCase", () => {
  it("paginates cluster observations by start time cursor", async () => {
    const clusterId = TaxonomyClusterId("k".repeat(24))
    const observations = createFakeTaxonomyObservationRepository(
      [0, 1, 2].map((index) => makeObservation(index, clusterId)),
    )

    const firstPage = await Effect.runPromise(
      listObservationsInClusterUseCase({ organizationId, projectId, clusterId, pageSize: 2 }).pipe(
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
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
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(secondPage.observations.map((observation) => observation.sessionId)).toEqual([SessionId("session-0")])
    expect(secondPage.hasMore).toBe(false)
    expect(secondPage.nextCursor).toBeNull()
  })

  it("does not skip observations that share a page-boundary timestamp", async () => {
    const clusterId = TaxonomyClusterId("s".repeat(24))
    const observations = createFakeTaxonomyObservationRepository(
      [0, 1, 2].map((index) => ({ ...makeObservation(index, clusterId), startTime: now })),
    )

    const firstPage = await Effect.runPromise(
      listObservationsInClusterUseCase({ organizationId, projectId, clusterId, pageSize: 2 }).pipe(
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
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
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
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

describe("listProjectBehavioursUseCase", () => {
  it("returns the topic tree and hides pending or empty nodes", async () => {
    const rootId = TaxonomyClusterId("a".repeat(24))
    const childId = TaxonomyClusterId("b".repeat(24))
    const leafRootId = TaxonomyClusterId("u".repeat(24))
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: rootId, observationCount: 3 }),
      makeCluster({
        id: childId,
        parentClusterId: rootId,
        depth: 1,
        path: `${rootId}/`,
        observationCount: 3,
      }),
      makeCluster({ id: leafRootId, observationCount: 3 }),
      makeCluster({ id: TaxonomyClusterId("g".repeat(24)), name: "Pending", observationCount: 10 }),
      makeCluster({ id: TaxonomyClusterId("e".repeat(24)), observationCount: 0 }),
      makeCluster({ id: TaxonomyClusterId("d".repeat(24)), state: "deprecated", observationCount: 20 }),
    ])
    const observations = createFakeTaxonomyObservationRepository([
      makeObservation(1, childId),
      makeObservation(2, childId),
      makeObservation(3, childId),
      makeObservation(4, leafRootId),
      makeObservation(5, leafRootId),
      makeObservation(6, leafRootId),
    ])

    const result = await Effect.runPromise(
      listProjectBehavioursUseCase({ organizationId, projectId, now }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    // Topics sort by subtree volume; children nest under their parent node.
    expect(result.topics.map((topic) => topic.cluster.id)).toEqual([rootId, leafRootId])
    expect(result.topics[0]?.children.map((child) => child.cluster.id)).toEqual([childId])
    // Parent counters are aggregate subtree counters, so the UI must not add
    // the parent value to its children and double-count the same sessions.
    expect(result.topics[0]?.subtreeObservationCount).toBe(3)
    expect(result.topics[1]?.subtreeObservationCount).toBe(3)
  })

  it("hides roots without a displayable name", async () => {
    const pendingRootId = TaxonomyClusterId("u".repeat(24))
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: pendingRootId, name: "Pending", observationCount: 3 }),
    ])
    const observations = createFakeTaxonomyObservationRepository([makeObservation(1, pendingRootId)])

    const result = await Effect.runPromise(
      listProjectBehavioursUseCase({ organizationId, projectId, now }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.topics).toEqual([])
  })

  it("filters new-this-week behaviours from firstObservedAt", async () => {
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: TaxonomyClusterId("n".repeat(24)), firstObservedAt: new Date("2026-05-22T00:00:00.000Z") }),
      makeCluster({ id: TaxonomyClusterId("o".repeat(24)), firstObservedAt: new Date("2026-04-01T00:00:00.000Z") }),
    ])
    const observations = createFakeTaxonomyObservationRepository([
      makeObservation(1, TaxonomyClusterId("n".repeat(24))),
      makeObservation(2, TaxonomyClusterId("o".repeat(24))),
    ])

    const result = await Effect.runPromise(
      listProjectBehavioursUseCase({ organizationId, projectId, now, segment: "new_this_week" }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.topics.map((topic) => [topic.cluster.id, topic.firstSeenLabel])).toEqual([
      [TaxonomyClusterId("n".repeat(24)), "this_week"],
    ])
  })

  it("filters spiking behaviours from exhaustive trend counts", async () => {
    const clusterId = TaxonomyClusterId("s".repeat(24))
    const stableId = TaxonomyClusterId("t".repeat(24))
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: clusterId, firstObservedAt: new Date("2026-04-01T00:00:00.000Z"), observationCount: 6 }),
      makeCluster({ id: stableId, firstObservedAt: new Date("2026-04-01T00:00:00.000Z"), observationCount: 6 }),
    ])
    const observations = createFakeTaxonomyObservationRepository([
      { ...makeObservation(1, clusterId), startTime: new Date("2026-05-20T00:00:00.000Z") },
      ...[2, 3, 4, 5, 6].map((index) => makeObservation(index, clusterId)),
      ...[7, 8, 9].map((index) => ({
        ...makeObservation(index, stableId),
        startTime: new Date("2026-05-20T00:00:00.000Z"),
      })),
    ])

    const result = await Effect.runPromise(
      listProjectBehavioursUseCase({ organizationId, projectId, now, segment: "spiking" }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.topics.map((topic) => [topic.cluster.id, topic.trend.status])).toEqual([[clusterId, "spike"]])
  })

  it("treats older clusters with zero baseline and enough current volume as spiking", async () => {
    const clusterId = TaxonomyClusterId("z".repeat(24))
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: clusterId, firstObservedAt: new Date("2026-04-01T00:00:00.000Z"), observationCount: 3 }),
    ])
    const observations = createFakeTaxonomyObservationRepository(
      [1, 2, 3].map((index) => makeObservation(index, clusterId)),
    )

    const result = await Effect.runPromise(
      listProjectBehavioursUseCase({ organizationId, projectId, now, minObservations: 3, segment: "spiking" }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.topics.map((topic) => [topic.cluster.id, topic.trend.status])).toEqual([[clusterId, "new"]])
  })

  it("suppresses low-volume behaviours and respects project/org trend scope", async () => {
    const otherOrganizationId = OrganizationId("z".repeat(24))
    const visibleId = TaxonomyClusterId("v".repeat(24))
    const lowVolumeId = TaxonomyClusterId("l".repeat(24))
    const wrongOrgOnlyId = TaxonomyClusterId("w".repeat(24))
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: visibleId, observationCount: 2 }),
      makeCluster({ id: lowVolumeId, observationCount: 1 }),
      makeCluster({ id: wrongOrgOnlyId, observationCount: 2 }),
      makeCluster({
        id: TaxonomyClusterId("x".repeat(24)),
        projectId: ProjectId("x".repeat(24)),
        observationCount: 100,
      }),
    ])
    const observations = createFakeTaxonomyObservationRepository([
      makeObservation(1, visibleId),
      makeObservation(2, visibleId),
      { ...makeObservation(3, wrongOrgOnlyId), organizationId: otherOrganizationId },
    ])

    const result = await Effect.runPromise(
      listProjectBehavioursUseCase({ organizationId, projectId, now, minObservations: 2, segment: "spiking" }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result.topics).toEqual([])
  })
})

describe("analytics read use-cases", () => {
  it("gets taxonomy analytics counts and top clusters", async () => {
    const clusters = createFakeTaxonomyClusterRepository([
      makeCluster({ id: TaxonomyClusterId("a".repeat(24)), observationCount: 2 }),
      makeCluster({ id: TaxonomyClusterId("b".repeat(24)), observationCount: 8 }),
      makeCluster({ id: TaxonomyClusterId("c".repeat(24)), state: "deprecated", observationCount: 20 }),
    ])
    const observations = createFakeTaxonomyObservationRepository([
      makeObservation(1, TaxonomyClusterId("a".repeat(24))),
      makeObservation(2, TaxonomyClusterId("b".repeat(24))),
      makeObservation(3, TaxonomyClusterId("a".repeat(24))),
    ])

    const result = await Effect.runPromise(
      getTaxonomyAnalyticsUseCase({ organizationId, projectId, now, windowDays: 1 }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

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
        dimension: "topic",
        trigger: "manual",
        status: "completed",
        startedAt: now,
        completedAt: now,
        observationsScanned: 2,
        noiseScanned: 2,
        clustersBorn: 1,
        clustersMerged: 0,
        clustersDeprecated: 0,
        error: null,
      },
    ])
    const lineage = createFakeTaxonomyLineageRepository([
      {
        id: TaxonomyLineageId("d".repeat(24)),
        organizationId,
        projectId,
        dimension: "topic",
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
        dimension: "topic",
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
