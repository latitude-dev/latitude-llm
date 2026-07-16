import { AI } from "@domain/ai"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { DistributedLockRepository, OrganizationId, ProjectId, SessionId, TaxonomyRunId } from "@domain/shared"
import { createFakeDistributedLockRepository } from "@domain/shared/testing"
import {
  buildHierarchicalTaxonomyUseCase,
  CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS,
  emitLineageUseCase,
  nameClusterUseCase,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_SWEEP_SPREAD_MS,
  TaxonomyClusterRepository,
  TaxonomyLineageRepository,
  type TaxonomyMomentObservation,
  TaxonomyObservationRepository,
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
    AIEmbedLive: {},
    AIGenerateLive: {},
    AIRerankLive: {},
    withAi: () => Eff.provide(EffLayer.succeed(AI, mockAi)),
  }
})

import { WorkflowAlreadyStartedError } from "@domain/queue"
import {
  runGardenCustomBehaviorJob,
  runGardenCustomBehaviorSweepJob,
  runGardenProjectJob,
  runGardenSweepJob,
} from "./taxonomy.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const PROJECT_ID_2 = ProjectId("q".repeat(24))
const PROJECT_ID_E2E = ProjectId("r".repeat(24))
const CUSTOM_BEHAVIOR_ID = "b".repeat(24)
const START_TIME = new Date("2026-05-24T12:00:00.000Z")

const recordingWorkflowStarter = () => {
  const started: Array<{ readonly workflow: string; readonly input: unknown; readonly workflowId: string }> = []
  const starter = {
    start: (workflow: string, input: unknown, options: { readonly workflowId: string }) => {
      started.push({ workflow, input, workflowId: options.workflowId })
      return Effect.void
    },
    signalWithStart: () => Effect.void,
  }
  return { started, starter }
}

const runtimeDeps = (workflowStarter?: unknown) =>
  ({
    clickhouseClient: null as never,
    postgresClient: null as never,
    redisClient: null as never,
    ...(workflowStarter === undefined ? {} : { workflowStarter: workflowStarter as never }),
  }) as never

const activeProjectRow = (projectId = PROJECT_ID) => ({ organization_id: ORGANIZATION_ID, project_id: projectId })

const enoughObservationCounts = () =>
  Effect.succeed({
    total: TAXONOMY_GARDENING_MIN_OBSERVATIONS,
    assigned: 0,
    noise: TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  })

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

/**
 * Runs one garden pass by composing the live workflow steps in order: the
 * divisive build (which also runs the Hungarian continuity matcher against the
 * previous pass), lineage emission, then deepest-first naming of births and any
 * still-`Pending` continuations — exactly what the Temporal workflow schedules.
 */
const gardenOnce = (runId: ReturnType<typeof TaxonomyRunId>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const built = yield* buildHierarchicalTaxonomyUseCase({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID_E2E,
        runId,
        dimension: "topic",
      })
      yield* emitLineageUseCase({ transitions: built.lineage })
      const clusters = yield* TaxonomyClusterRepository
      const active = yield* clusters.listActiveByProject({ projectId: PROJECT_ID_E2E, dimension: "topic" })
      const bornIds = new Set(built.lineage.flatMap((row) => (row.transitionType === "birth" ? row.toClusterIds : [])))
      // Name births and continuations that drifted enough to be left "Pending",
      // deepest-first so interior nodes see their children's final names.
      const toName = [...active]
        .filter((cluster) => bornIds.has(cluster.id) || cluster.name === "Pending")
        .sort((a, b) => b.depth - a.depth)
      for (const cluster of toName) {
        yield* nameClusterUseCase({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID_E2E, clusterId: cluster.id })
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
    const queue = createFakeQueuePublisher()

    await Effect.runPromise(
      runGardenSweepJob(
        { triggeredAt: START_TIME.toISOString() },
        {
          listActiveProjects: () => Effect.succeed([activeProjectRow()]),
          readObservationCounts: enoughObservationCounts,
          publisher: queue.publisher,
        },
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

  it("spreads cron workflow starts across the sweep window", async () => {
    const queue = createFakeQueuePublisher()
    const started: Array<{
      readonly workflow: string
      readonly input: unknown
      readonly workflowId: string
      readonly startDelayMs?: number
    }> = []
    const workflowStarter = {
      start: (
        workflow: string,
        input: unknown,
        options: { readonly workflowId: string; readonly startDelayMs?: number },
      ) => {
        started.push({
          workflow,
          input,
          workflowId: options.workflowId,
          ...(options.startDelayMs === undefined ? {} : { startDelayMs: options.startDelayMs }),
        })
        return Effect.void
      },
      signalWithStart: () => Effect.void,
    }

    await Effect.runPromise(
      runGardenSweepJob(
        { triggeredAt: START_TIME.toISOString() },
        {
          listActiveProjects: () => Effect.succeed([activeProjectRow(PROJECT_ID_2)]),
          readObservationCounts: enoughObservationCounts,
          publisher: queue.publisher,
          workflowStarter: workflowStarter as never,
        },
      ),
    )

    expect(started).toHaveLength(1)
    expect(started[0]).toMatchObject({
      workflow: "gardenTaxonomyWorkflow",
      input: { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID_2, dimension: "topic", trigger: "cron" },
      workflowId: `org:${ORGANIZATION_ID}:taxonomy:gardenProject:${PROJECT_ID_2}`,
    })
    expect(started[0]?.startDelayMs).toEqual(expect.any(Number))
    expect(started[0]?.startDelayMs).toBeGreaterThanOrEqual(0)
    expect(started[0]?.startDelayMs).toBeLessThan(TAXONOMY_GARDENING_SWEEP_SPREAD_MS)
  })

  it("continues the garden sweep when one project publish fails", async () => {
    const queue = createFakeQueuePublisher()
    const publisher = {
      ...queue.publisher,
      publish: (queueName, task, payload, options) => {
        if ((payload as { projectId: string }).projectId === PROJECT_ID) return Effect.fail(new Error("boom") as never)
        return queue.publisher.publish(queueName, task, payload, options)
      },
    } as typeof queue.publisher

    await Effect.runPromise(
      runGardenSweepJob(
        { triggeredAt: START_TIME.toISOString() },
        {
          listActiveProjects: () => Effect.succeed([activeProjectRow(), activeProjectRow(PROJECT_ID_2)]),
          readObservationCounts: enoughObservationCounts,
          publisher,
        },
      ),
    )

    expect(queue.published).toHaveLength(1)
    expect(queue.published[0]).toMatchObject({ payload: { projectId: PROJECT_ID_2 } })
  })

  it("runs end-to-end gardening with births, names, lineage, and a stable continuation across passes", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        const recent = new Date()
        // The divisive build has a cold-start gate of TAXONOMY_GARDENING_MIN_OBSERVATIONS
        // (15); seed comfortably above it so the single topic materializes as a root.
        for (let index = 300; index < 320; index++) {
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

    const firstClusterId = firstPass.clusters[0]?.id
    expect(firstClusterId).toBeDefined()

    // Second pass rebuilds the tree from scratch over the same observations.
    // The Hungarian continuity matcher must recognise the single root as the
    // same topic and reuse its id — `continuation`, not a fresh birth+death.
    await gardenOnce(TaxonomyRunId("2".repeat(24)))

    const secondPass = await Effect.runPromise(
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

    expect(secondPass.clusters).toHaveLength(1)
    expect(secondPass.clusters[0]?.id).toBe(firstClusterId)
    expect(secondPass.lineage.map((row) => row.transitionType)).toContain("continuation")
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

  it("starts the scoped workflow deduped on the behavior, passing the job reason as trigger", async () => {
    const { started, starter } = recordingWorkflowStarter()

    await Effect.runPromise(
      runGardenCustomBehaviorJob(
        {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          customBehaviorId: CUSTOM_BEHAVIOR_ID,
          reason: "cron",
        },
        runtimeDeps(starter),
      ),
    )

    expect(started).toEqual([
      {
        workflow: "gardenCustomBehaviorWorkflow",
        input: {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          customBehaviorId: CUSTOM_BEHAVIOR_ID,
          trigger: "cron",
        },
        workflowId: `org:${ORGANIZATION_ID}:taxonomy:gardenCustomBehavior:${CUSTOM_BEHAVIOR_ID}`,
      },
    ])
  })

  it("defaults the trigger to manual when the job carries no reason", async () => {
    const { started, starter } = recordingWorkflowStarter()

    await Effect.runPromise(
      runGardenCustomBehaviorJob(
        { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, customBehaviorId: CUSTOM_BEHAVIOR_ID },
        runtimeDeps(starter),
      ),
    )

    expect((started[0]?.input as { trigger: string }).trigger).toBe("manual")
  })

  it("collapses WorkflowAlreadyStartedError into a no-op instead of rethrowing", async () => {
    let calls = 0
    const starter = {
      start: () => {
        calls += 1
        return Effect.fail(
          new WorkflowAlreadyStartedError({
            workflowId: `org:${ORGANIZATION_ID}:taxonomy:gardenCustomBehavior:${CUSTOM_BEHAVIOR_ID}`,
            workflow: "gardenCustomBehaviorWorkflow",
          }),
        )
      },
      signalWithStart: () => Effect.void,
    }

    await expect(
      Effect.runPromise(
        runGardenCustomBehaviorJob(
          { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, customBehaviorId: CUSTOM_BEHAVIOR_ID },
          runtimeDeps(starter),
        ),
      ),
    ).resolves.toBeUndefined()
    expect(calls).toBe(1)
  })

  it("skips without throwing when no workflow starter is configured", async () => {
    await expect(
      Effect.runPromise(
        runGardenCustomBehaviorJob(
          { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, customBehaviorId: CUSTOM_BEHAVIOR_ID },
          runtimeDeps(),
        ),
      ),
    ).resolves.toBeUndefined()
  })
})

describe("custom behavior gardening sweep", () => {
  const CUSTOM_BEHAVIOR_ID_2 = "c".repeat(24)
  const behaviorRef = (customBehaviorId: string, projectId: ProjectId = PROJECT_ID) => ({
    organization_id: ORGANIZATION_ID as string,
    project_id: projectId as string,
    custom_behavior_id: customBehaviorId,
  })

  it("enqueues a reason:cron gardenCustomBehavior job deduped per eligible behavior", async () => {
    const queue = createFakeQueuePublisher()

    await Effect.runPromise(
      runGardenCustomBehaviorSweepJob(
        { triggeredAt: START_TIME.toISOString() },
        {
          listGardenableCustomBehaviors: () =>
            Effect.succeed([behaviorRef(CUSTOM_BEHAVIOR_ID), behaviorRef(CUSTOM_BEHAVIOR_ID_2)]),
          publisher: queue.publisher,
        },
      ),
    )

    expect(queue.published).toHaveLength(2)
    expect(queue.published[0]).toMatchObject({
      queue: "taxonomy",
      task: "gardenCustomBehavior",
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        customBehaviorId: CUSTOM_BEHAVIOR_ID,
        reason: "cron",
      },
      options: {
        dedupeKey: `org:${ORGANIZATION_ID}:taxonomy:gardenCustomBehavior:${CUSTOM_BEHAVIOR_ID}`,
        // TTL-based dedupe (not a bare/retained jobId) so recurring sweeps keep re-enqueueing.
        leadingThrottleMs: CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS,
      },
    })
  })

  it("anchors the throttle window at execution time when the payload carries no triggeredAt", async () => {
    let seenGardenedBefore: Date | null = null
    const queue = createFakeQueuePublisher()
    const before = Date.now()

    await Effect.runPromise(
      runGardenCustomBehaviorSweepJob(
        {},
        {
          listGardenableCustomBehaviors: (gardenedBefore) => {
            seenGardenedBefore = gardenedBefore
            return Effect.succeed([])
          },
          publisher: queue.publisher,
        },
      ),
    )

    // No frozen payload timestamp: gardenedBefore tracks "now − cadence", so the
    // window keeps advancing on every repeatable fire instead of stalling.
    const expected = before - CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS
    expect(seenGardenedBefore).not.toBeNull()
    expect((seenGardenedBefore as unknown as Date).getTime()).toBeGreaterThanOrEqual(expected)
    expect((seenGardenedBefore as unknown as Date).getTime()).toBeLessThanOrEqual(expected + 60_000)
  })

  it("throttles eligibility with a gardenedBefore anchored before the trigger time", async () => {
    let seenGardenedBefore: Date | null = null
    const queue = createFakeQueuePublisher()

    await Effect.runPromise(
      runGardenCustomBehaviorSweepJob(
        { triggeredAt: START_TIME.toISOString() },
        {
          listGardenableCustomBehaviors: (gardenedBefore) => {
            seenGardenedBefore = gardenedBefore
            return Effect.succeed([])
          },
          publisher: queue.publisher,
        },
      ),
    )

    expect(seenGardenedBefore).not.toBeNull()
    expect((seenGardenedBefore as unknown as Date).getTime()).toBeLessThan(START_TIME.getTime())
  })

  it("continues the sweep when one behavior enqueue fails", async () => {
    const queue = createFakeQueuePublisher()
    const publisher = {
      ...queue.publisher,
      publish: (queueName, task, payload, options) => {
        if ((payload as { customBehaviorId: string }).customBehaviorId === CUSTOM_BEHAVIOR_ID) {
          return Effect.fail(new Error("boom") as never)
        }
        return queue.publisher.publish(queueName, task, payload, options)
      },
    } as typeof queue.publisher

    await Effect.runPromise(
      runGardenCustomBehaviorSweepJob(
        { triggeredAt: START_TIME.toISOString() },
        {
          listGardenableCustomBehaviors: () =>
            Effect.succeed([behaviorRef(CUSTOM_BEHAVIOR_ID), behaviorRef(CUSTOM_BEHAVIOR_ID_2)]),
          publisher,
        },
      ),
    )

    expect(queue.published).toHaveLength(1)
    expect(queue.published[0]).toMatchObject({ payload: { customBehaviorId: CUSTOM_BEHAVIOR_ID_2 } })
  })
})
