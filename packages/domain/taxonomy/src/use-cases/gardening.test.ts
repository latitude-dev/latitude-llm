import { AI, type AIShape, EMBEDDING_DIMENSIONS, type GenerateInput, type GenerateResult } from "@domain/ai"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import {
  ChSqlClient,
  DistributedLockRepository,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  TaxonomyClusterId,
  TaxonomyLineageId,
  TaxonomyRunId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { createTaxonomyCentroid, updateTaxonomyCentroid } from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyLineageRepository } from "../ports/taxonomy-lineage-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyLineageRepository } from "../testing/fake-taxonomy-lineage-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import { assertTaxonomyQualityUseCase } from "./assert-taxonomy-quality.ts"
import { emitLineageUseCase } from "./emit-lineage.ts"
import { nameClusterUseCase } from "./name-taxonomy.ts"
import { routeToDeepestClusterUseCase } from "./route-to-deepest-cluster.ts"
import { taxonomyGardenProjectDedupeKey, triggerProjectGardeningUseCase } from "./trigger-project-gardening.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const vector = (values: Record<number, number>) => {
  const result = new Array(EMBEDDING_DIMENSIONS).fill(0)
  for (const [index, value] of Object.entries(values)) result[Number(index)] = value
  return result
}

const makeObservation = (index: number, embedding = vector({ 0: 1 })): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Observation ${index}` },
  embedding,
  startTime: new Date(now.getTime() + index * 1000),
  endTime: new Date(now.getTime() + index * 1000 + 500),
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: 90,
  // Analysis writes always precede gardening writes; an equal version would
  // be a ReplacingMergeTree tie the fake (correctly) refuses to overwrite.
  indexedAt: new Date(now.getTime() - 60_000),
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
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
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
    TaxonomyObservationRepository | TaxonomyClusterRepository | DistributedLockRepository | SqlClient | ChSqlClient | AI
  >,
  observations: ReturnType<typeof createFakeTaxonomyObservationRepository>,
  clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>,
  ai?: AIShape,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      Effect.provide(Layer.succeed(AI, ai ?? createDeterministicAi())),
    ),
  )

const createDeterministicAi = (): AIShape => ({
  generate: <T>(input: GenerateInput<T>) =>
    Effect.sync((): GenerateResult<T> => {
      const raw = input.system.includes("proposeCandidateThemes")
        ? { candidates: [{ theme: "deterministic theme", examples: [0] }] }
        : input.system.includes("behaviour profile")
          ? {
              userGoal: "A deterministic user goal",
              userGoalVariants: [],
              agentPattern: "A deterministic agent pattern",
              commonFriction: "A deterministic friction summary",
              outcomeSummary: "A deterministic outcome summary",
              representativeQuotes: [],
              answerPatternStatus: "unknown",
              answerConsistencyScore: null,
              confidence: 0.5,
            }
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
  it("keeps a parent assignment when child descent fails the split threshold", async () => {
    const parent = makeCluster({
      id: "a".repeat(24) as TaxonomyCluster["id"],
      splitLinkThreshold: 0.9,
    })
    const child = makeCluster({
      id: "b".repeat(24) as TaxonomyCluster["id"],
      parentClusterId: parent.id,
      path: `${parent.id}/`,
      depth: 1,
      centroid: centroidFrom(vector({ 0: 0.8, 1: 0.6 })),
    })
    const observations = createFakeTaxonomyObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([parent, child])

    const result = await runUseCase(
      routeToDeepestClusterUseCase({ projectId, dimension: "topic", queryVector: vector({ 0: 1 }) }),
      observations,
      clusters,
    )

    expect(result).toEqual({ method: "centroid_online", clusterId: parent.id, confidence: 1 })
  })

  it("allows aggregate parents to keep direct residue assignments", async () => {
    const parent = makeCluster({ id: "p".repeat(24) as TaxonomyCluster["id"], observationCount: 2 })
    const child = makeCluster({
      id: "h".repeat(24) as TaxonomyCluster["id"],
      parentClusterId: parent.id,
      depth: 1,
      path: `${parent.id}/`,
      observationCount: 2,
    })
    const observations = createFakeTaxonomyObservationRepository([
      { ...makeObservation(40), assignedClusterId: parent.id, assignmentMethod: "gardening_reassign" },
    ])
    const clusters = createFakeTaxonomyClusterRepository([parent, child])

    await expect(
      runUseCase(assertTaxonomyQualityUseCase({ organizationId, projectId }), observations, clusters),
    ).resolves.toEqual({ clustersScanned: 2, findings: [] })
  })

  it("fails quality gates for exact sibling duplicates", async () => {
    const left = makeCluster({ id: "l".repeat(24) as TaxonomyCluster["id"], name: "Order Cancellation Requests" })
    const right = makeCluster({ id: "m".repeat(24) as TaxonomyCluster["id"], name: "order cancellation requests" })
    const observations = createFakeTaxonomyObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([left, right])

    await expect(runUseCase(assertTaxonomyQualityUseCase({ projectId }), observations, clusters)).rejects.toMatchObject(
      { _tag: "TaxonomyQualityGateError" },
    )
  })

  it("names clusters with deterministic AI map-reduce calls", async () => {
    const cluster = makeCluster({
      id: "j".repeat(24) as TaxonomyCluster["id"],
      name: "Pending",
    })
    const observations = createFakeTaxonomyObservationRepository(
      [0, 1, 2, 3].map((index) => ({
        ...makeObservation(index, vector({ [index]: 1 })),
        assignedClusterId: cluster.id,
        summary: `sample ${index}`,
      })),
    )
    const clusters = createFakeTaxonomyClusterRepository([cluster])
    let calls = 0
    const ai: AIShape = {
      generate: <T>(input: GenerateInput<T>) =>
        Effect.sync((): GenerateResult<T> => {
          calls++
          const raw = input.system.includes("proposeCandidateThemes")
            ? { candidates: [{ theme: "deterministic theme", examples: [0] }] }
            : {
                name: "Named cluster",
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
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
        Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
      ),
    )

    expect(calls).toBe(2)
    expect(clusters.clusters.get(cluster.id)?.name).toBe("Named cluster")
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

  it("persists lineage transitions through emitLineageUseCase", async () => {
    const lineageRepository = createFakeTaxonomyLineageRepository()
    const transitions: TaxonomyClusterLineage[] = [
      {
        id: TaxonomyLineageId("l".repeat(24)),
        organizationId,
        projectId,
        dimension: "topic",
        runId,
        transitionType: "birth",
        fromClusterIds: [],
        toClusterIds: [TaxonomyClusterId("c".repeat(24))],
        similarity: null,
        createdAt: now,
      },
    ]

    const emitResult = await Effect.runPromise(
      emitLineageUseCase({ transitions }).pipe(
        Effect.provide(Layer.succeed(TaxonomyLineageRepository, lineageRepository.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(emitResult).toEqual({ emitted: 1 })
    expect(lineageRepository.rows.map((row) => row.transitionType)).toEqual(["birth"])
  })
})
