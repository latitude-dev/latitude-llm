import { AI } from "@domain/ai"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import {
  DistributedLockRepository,
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import { createFakeDistributedLockRepository } from "@domain/shared/testing"
import {
  createTaxonomyCentroid,
  deprecateInactiveClustersUseCase,
  emitLineageUseCase,
  mergeNearDuplicateClustersUseCase,
  nameClusterUseCase,
  reassignNoiseToCurrentClustersUseCase,
  recurseTreeClustersUseCase,
  sweepNoiseAndBirthClustersUseCase,
  type TaxonomyCluster,
  TaxonomyClusterRepository,
  TaxonomyLineageRepository,
  type TaxonomyMomentObservation,
  TaxonomyObservationRepository,
  updateTaxonomyCentroid,
} from "@domain/taxonomy"
import { type ClickHouseClient, TaxonomyObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { TaxonomyClusterRepositoryLive, TaxonomyLineageRepositoryLive, withPostgres } from "@platform/db-postgres"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"

const { mockAi, testEmbedding } = vi.hoisted(() => {
  const embedding = new Array(2048).fill(0)
  embedding[0] = 1
  return {
    testEmbedding: embedding,
    mockAi: {
      generate: vi.fn((input) =>
        Effect.succeed({
          object: input.schema.parse(
            input.schema.safeParse({ candidates: [{ theme: "cancellation", examples: [0] }] }).success
              ? { candidates: [{ theme: "cancellation", examples: [0] }] }
              : input.schema.safeParse({
                    name: "Cancellation",
                    description: "Users ask for help canceling subscriptions.",
                  }).success
                ? { name: "Cancellation", description: "Users ask for help canceling subscriptions." }
                : input.schema.safeParse({
                      userGoal: "Cancel a subscription",
                      userGoalVariants: ["Cancel account"],
                      agentPattern: "Assistant explains cancellation steps",
                      commonFriction: "Users need help finding the cancellation path",
                      outcomeSummary: "Most examples provide cancellation guidance",
                      representativeQuotes: [{ quote: "I want to cancel" }],
                      answerPatternStatus: "stable_answer_observed",
                      answerConsistencyScore: 0.8,
                      confidence: 0.9,
                    }).success
                  ? {
                      userGoal: "Cancel a subscription",
                      userGoalVariants: ["Cancel account"],
                      agentPattern: "Assistant explains cancellation steps",
                      commonFriction: "Users need help finding the cancellation path",
                      outcomeSummary: "Most examples provide cancellation guidance",
                      representativeQuotes: [{ quote: "I want to cancel" }],
                      answerPatternStatus: "stable_answer_observed",
                      answerConsistencyScore: 0.8,
                      confidence: 0.9,
                    }
                  : {
                      summary: "User asked to cancel and the assistant gave cancellation steps.",
                      primaryActor: "both",
                      intentTags: ["cancellation"],
                    },
          ),
          tokens: 1,
          duration: 1,
        }),
      ),
      embed: vi.fn(() => Effect.succeed({ embedding })),
      rerank: vi.fn(() => Effect.succeed([])),
    },
  }
})

const TEST_EMBEDDING = testEmbedding

vi.mock("@platform/ai", async () => {
  const { Effect: Eff, Layer: EffLayer } = (await vi.importActual("effect")) as typeof import("effect")
  return {
    withAi: () => Eff.provide(EffLayer.succeed(AI, mockAi)),
  }
})

import { runGardenProjectJob, runGardenSweepJob } from "./taxonomy.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const PROJECT_ID_2 = ProjectId("q".repeat(24))
const PROJECT_ID_E2E = ProjectId("r".repeat(24))
const CLUSTER_ID = TaxonomyClusterId("c".repeat(24))
const START_TIME = new Date("2026-05-24T12:00:00.000Z")

const createFakeRedisClient = () => {
  const values = new Map<string, string>()
  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && values.has(key)) return null
      values.set(key, value)
      return "OK"
    },
    del: async (key: string) => values.delete(key),
    eval: async (_script: string, _keyCount: number, key: string, token: string) => {
      if (values.get(key) !== token) return 0
      values.delete(key)
      return 1
    },
  }
}

const centroidFromTestEmbedding = (embedding = TEST_EMBEDDING) => {
  const centroid = createTaxonomyCentroid()
  const updated = updateTaxonomyCentroid({
    centroid: { ...centroid, clusteredAt: START_TIME },
    embedding,
    weight: 1,
    timestamp: START_TIME,
    operation: "add",
    previousClusteredAt: START_TIME,
  })
  const { clusteredAt: _clusteredAt, ...withoutAnchor } = updated
  return withoutAnchor
}

const makeObservation = (
  index: number,
  projectId = PROJECT_ID,
  embedding = TEST_EMBEDDING,
): TaxonomyMomentObservation => ({
  organizationId: ORGANIZATION_ID,
  projectId,
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`garden-session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Garden observation ${index}` },
  embedding,
  startTime: new Date(START_TIME.getTime() + index * 1000),
  endTime: new Date(START_TIME.getTime() + index * 1000 + 500),
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: 90,
  indexedAt: START_TIME,
})

const makeCluster = (): TaxonomyCluster => ({
  id: CLUSTER_ID,
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "Cancellation requests",
  description: "Users ask to cancel subscriptions.",
  centroid: centroidFromTestEmbedding(),
  observationCount: 1,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: START_TIME,
  lastObservedAt: START_TIME,
  clusteredAt: START_TIME,
  createdAt: START_TIME,
  updatedAt: START_TIME,
})

/**
 * Runs one garden pass by composing the same step use-cases the Temporal
 * workflow schedules, in the same order — the legacy in-process orchestrator
 * was removed with the category model.
 */
const gardenOnce = (runId: ReturnType<typeof TaxonomyRunId>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const base = { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID_E2E, runId }
      const births = yield* sweepNoiseAndBirthClustersUseCase(base)
      const merges = yield* mergeNearDuplicateClustersUseCase(base)
      const deaths = yield* deprecateInactiveClustersUseCase(base)
      yield* reassignNoiseToCurrentClustersUseCase(base)
      const recursion = yield* recurseTreeClustersUseCase(base)
      const lineage = [...births.lineage, ...merges.lineage, ...deaths.lineage, ...recursion.lineage]
      yield* emitLineageUseCase({ transitions: lineage })
      const bornClusterIds = new Set(
        lineage.flatMap((row) =>
          row.transitionType === "birth" || row.transitionType === "split" ? row.toClusterIds : [],
        ),
      )
      for (const clusterId of bornClusterIds) {
        yield* nameClusterUseCase({
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID_E2E,
          clusterId: TaxonomyClusterId(clusterId),
        })
      }
    }).pipe(
      withPostgres(
        Layer.mergeAll(TaxonomyClusterRepositoryLive, TaxonomyLineageRepositoryLive),
        pg.appPostgresClient,
        ORGANIZATION_ID,
      ),
      withClickHouse(TaxonomyObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID),
      Effect.provide(Layer.succeed(AI, mockAi as never)),
      Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
    ),
  )

describe("taxonomy gardening worker", () => {
  it("sweeps projects with enough observations and publishes throttled gardenProject jobs", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        for (let index = 100; index < 115; index++) {
          yield* repo.upsert(makeObservation(index))
        }
      }).pipe(withClickHouse(TaxonomyObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
    )
    const queue = createFakeQueuePublisher()
    const adminPostgresClient = {
      pool: {
        query: async () => ({ rows: [{ organization_id: ORGANIZATION_ID, project_id: PROJECT_ID }] }),
      },
    }

    await Effect.runPromise(
      runGardenSweepJob(
        { triggeredAt: START_TIME.toISOString() },
        { clickhouseClient: ch.client, adminPostgresClient: adminPostgresClient as never, publisher: queue.publisher },
      ),
    )

    expect(queue.published).toHaveLength(1)
    expect(queue.published[0]).toMatchObject({
      queue: "taxonomy",
      task: "gardenProject",
      payload: { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, reason: "cron" },
    })
    expect(queue.published[0]?.options?.dedupeKey).toContain(`org:${ORGANIZATION_ID}:`)
  })

  it("continues the garden sweep when one project publish fails", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        for (let index = 200; index < 215; index++) {
          yield* repo.upsert({ ...makeObservation(index), projectId: PROJECT_ID_2 })
        }
      }).pipe(withClickHouse(TaxonomyObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
    )
    const queue = createFakeQueuePublisher()
    const publisher = {
      ...queue.publisher,
      publish: (queueName, task, payload, options) => {
        if ((payload as { projectId: string }).projectId === PROJECT_ID) return Effect.fail(new Error("boom") as never)
        return queue.publisher.publish(queueName, task, payload, options)
      },
    } as typeof queue.publisher
    const adminPostgresClient = {
      pool: {
        query: async () => ({
          rows: [
            { organization_id: ORGANIZATION_ID, project_id: PROJECT_ID },
            { organization_id: ORGANIZATION_ID, project_id: PROJECT_ID_2 },
          ],
        }),
      },
    }

    await Effect.runPromise(
      runGardenSweepJob(
        { triggeredAt: START_TIME.toISOString() },
        { clickhouseClient: ch.client, adminPostgresClient: adminPostgresClient as never, publisher },
      ),
    )

    expect(queue.published).toHaveLength(1)
    expect(queue.published[0]).toMatchObject({ payload: { projectId: PROJECT_ID_2 } })
  })

  it("runs end-to-end gardening with births, names, lineage, and follow-up merge", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        const recent = new Date()
        for (let index = 300; index < 304; index++) {
          yield* repo.upsert({
            ...makeObservation(index, PROJECT_ID_E2E),
            startTime: new Date(recent.getTime() + index * 1000),
            endTime: new Date(recent.getTime() + index * 1000 + 500),
          })
        }
      }).pipe(withClickHouse(TaxonomyObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
    )

    await gardenOnce(TaxonomyRunId("1".repeat(24)))

    const firstPass = await Effect.runPromise(
      Effect.gen(function* () {
        const clusters = yield* TaxonomyClusterRepository
        const lineage = yield* TaxonomyLineageRepository
        return {
          clusters: yield* clusters.listActiveByProject({ projectId: PROJECT_ID_E2E, dimension: "topic" }),
          lineage: yield* lineage.listRecent({ projectId: PROJECT_ID_E2E, dimension: "topic", limit: 10 }),
        }
      }).pipe(
        withPostgres(
          Layer.mergeAll(TaxonomyClusterRepositoryLive, TaxonomyLineageRepositoryLive),
          pg.appPostgresClient,
          ORGANIZATION_ID,
        ),
      ),
    )

    expect(firstPass.clusters).toHaveLength(1)
    expect(firstPass.clusters[0]?.name).toBe("Cancellation")
    expect(firstPass.clusters[0]?.parentClusterId).toBeNull()
    expect(firstPass.clusters[0]?.depth).toBe(0)
    expect(firstPass.lineage.map((row) => row.transitionType)).toContain("birth")

    const mergeA = TaxonomyClusterId("m".repeat(24))
    const mergeB = TaxonomyClusterId("n".repeat(24))
    await Effect.runPromise(
      Effect.gen(function* () {
        const clusters = yield* TaxonomyClusterRepository
        yield* clusters.save({
          ...makeCluster(),
          id: mergeA,
          projectId: PROJECT_ID_E2E,
          name: "Pending",
          centroid: centroidFromTestEmbedding(),
          observationCount: 2,
        })
        yield* clusters.save({
          ...makeCluster(),
          id: mergeB,
          projectId: PROJECT_ID_E2E,
          name: "Pending",
          centroid: centroidFromTestEmbedding(),
          observationCount: 1,
        })
      }).pipe(withPostgres(TaxonomyClusterRepositoryLive, pg.appPostgresClient, ORGANIZATION_ID)),
    )

    await gardenOnce(TaxonomyRunId("2".repeat(24)))

    const secondPass = await Effect.runPromise(
      Effect.gen(function* () {
        const lineage = yield* TaxonomyLineageRepository
        const clusters = yield* TaxonomyClusterRepository
        return {
          lineage: yield* lineage.listRecent({ projectId: PROJECT_ID_E2E, dimension: "topic", limit: 10 }),
          mergeB: yield* clusters.findById(mergeB),
        }
      }).pipe(
        withPostgres(
          Layer.mergeAll(TaxonomyClusterRepositoryLive, TaxonomyLineageRepositoryLive),
          pg.appPostgresClient,
          ORGANIZATION_ID,
        ),
      ),
    )

    expect(secondPass.lineage.map((row) => row.transitionType)).toContain("merge")
    expect(secondPass.mergeB.state).toBe("merged")
  })

  it("starts the garden workflow with the job reason as trigger", async () => {
    const started: Array<{ readonly workflow: string; readonly input: unknown; readonly workflowId: string }> = []
    const workflowStarter = {
      start: (workflow: string, input: unknown, options: { readonly workflowId: string }) => {
        started.push({ workflow, input, workflowId: options.workflowId })
        return Effect.void
      },
      signalWithStart: () => Effect.void,
    }

    await Effect.runPromise(
      runGardenProjectJob(
        { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, reason: "manual" },
        {
          clickhouseClient: ch.client,
          postgresClient: pg.appPostgresClient,
          redisClient: createFakeRedisClient() as never,
          workflowStarter: workflowStarter as never,
        },
      ),
    )

    expect(started).toEqual([
      {
        workflow: "gardenTaxonomyWorkflow",
        input: { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, dimension: "topic", trigger: "manual" },
        workflowId: `org:${ORGANIZATION_ID}:taxonomy:garden:${PROJECT_ID}`,
      },
    ])
  })
})
