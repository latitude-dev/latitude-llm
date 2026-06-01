import { AI } from "@domain/ai"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { OrganizationId, ProjectId, SessionId, TaxonomyClusterId, TraceId } from "@domain/shared"
import {
  BehaviorObservationRepository,
  createTaxonomyCentroid,
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

import { runGardenProjectJob, runGardenSweepJob, runObserveSessionJob } from "./taxonomy.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const PROJECT_ID_2 = ProjectId("q".repeat(24))
const PROJECT_ID_E2E = ProjectId("r".repeat(24))
const SESSION_ID = "taxonomy-session-1"
const TRACE_ID = "t".repeat(32)
const CLUSTER_ID = TaxonomyClusterId("c".repeat(24))
const START_TIME = new Date("2026-05-24T12:00:00.000Z")

const toClickHouseDateTime = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "")
const toMessageJson = (role: "user" | "assistant", content: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content }] }])
const toSystemJson = (content: string) => JSON.stringify([{ type: "text", content }])

const makeSpanRow = (input: { readonly traceId: string; readonly sessionId: string }) => ({
  organization_id: ORGANIZATION_ID as string,
  project_id: PROJECT_ID as string,
  session_id: input.sessionId,
  user_id: "",
  trace_id: input.traceId,
  span_id: "s".repeat(16),
  parent_span_id: "",
  api_key_id: "test-api-key",
  simulation_id: "",
  start_time: toClickHouseDateTime(START_TIME),
  end_time: toClickHouseDateTime(new Date(START_TIME.getTime() + 4_000)),
  name: "taxonomy-test-root",
  service_name: "taxonomy-test",
  kind: 0,
  status_code: 0,
  status_message: "",
  error_type: "",
  tags: [],
  metadata: {},
  operation: "chat",
  provider: "openai",
  model: "gpt-test",
  response_model: "gpt-test",
  tokens_input: 64,
  tokens_output: 48,
  tokens_cache_read: 0,
  tokens_cache_create: 0,
  tokens_reasoning: 0,
  cost_input_microcents: 0,
  cost_output_microcents: 0,
  cost_total_microcents: 0,
  cost_is_estimated: 0,
  time_to_first_token_ns: 0,
  is_streaming: 0,
  response_id: "",
  finish_reasons: [],
  input_messages: toMessageJson(
    "user",
    "I want to cancel my subscription. Please explain exactly how to cancel before renewal and how to confirm billing stops.",
  ),
  output_messages: toMessageJson(
    "assistant",
    "Open billing settings, choose manage plan, select cancel plan, confirm, and check your email for cancellation confirmation.",
  ),
  system_instructions: toSystemJson("You are a helpful assistant."),
  tool_definitions: "",
  tool_call_id: "",
  tool_name: "",
  tool_input: "",
  tool_output: "",
  attr_string: {},
  attr_int: {},
  attr_float: {},
  attr_bool: {},
  resource_string: {},
  scope_name: "",
  scope_version: "",
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

const makeObservation = (index: number, projectId = PROJECT_ID, embedding = TEST_EMBEDDING): TaxonomyObservation => ({
  organizationId: ORGANIZATION_ID,
  projectId,
  sessionId: SessionId(`garden-session-${index}`),
  startTime: new Date(START_TIME.getTime() + index * 1000),
  endTime: new Date(START_TIME.getTime() + index * 1000 + 500),
  traceIds: [TraceId(String(index).padStart(32, "g").slice(0, 32))],
  summary: `Garden observation ${index}`,
  summaryHash: String(index).repeat(64).slice(0, 64),
  embedding,
  embeddingModel: "voyage-4-large",
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
  parentCategoryId: null,
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

const insertSessionSpan = (traceId: string, sessionId: string) =>
  ch.client.insert({ table: "spans", values: [makeSpanRow({ traceId, sessionId })], format: "JSONEachRow" })

const runTaxonomyJob = (input: { readonly traceId: string; readonly sessionId: string }) =>
  Effect.runPromise(
    runObserveSessionJob(
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        sessionId: input.sessionId,
        triggeringTraceId: input.traceId,
        triggeringStartTime: START_TIME.toISOString(),
      },
      {
        clickhouseClient: ch.client,
        postgresClient: pg.appPostgresClient,
        redisClient: createFakeRedisClient() as never,
      },
    ),
  )

const listNoise = (since: Date) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* BehaviorObservationRepository
      return yield* repo.listNoise({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, since })
    }).pipe(withClickHouse(BehaviorObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
  )

const listClusterObservations = () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* BehaviorObservationRepository
      return yield* repo.listByCluster({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        clusterId: CLUSTER_ID,
        limit: 10,
      })
    }).pipe(withClickHouse(BehaviorObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
  )

const listLatestTaxonomyRun = () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* TaxonomyRunRepository
      return yield* repo.findLatestByProject({ projectId: PROJECT_ID })
    }).pipe(withPostgres(TaxonomyRunRepositoryLive, pg.appPostgresClient, ORGANIZATION_ID)),
  )

describe("taxonomy observeSession worker", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START_TIME)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("writes a noise observation when no active clusters exist", async () => {
    const traceId = TRACE_ID
    await insertSessionSpan(traceId, SESSION_ID)

    await runTaxonomyJob({ traceId, sessionId: SESSION_ID })

    const rows = await listNoise(new Date("2026-05-24T00:00:00.000Z"))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sessionId).toBe(SESSION_ID)
    expect(rows[0]?.assignmentMethod).toBe("noise")
  })

  it("assigns an observation to an existing active cluster", async () => {
    const traceId = "u".repeat(32)
    const sessionId = "taxonomy-session-2"
    await insertSessionSpan(traceId, sessionId)

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterRepository
        yield* repo.save(makeCluster())
      }).pipe(withPostgres(TaxonomyClusterRepositoryLive, pg.appPostgresClient, ORGANIZATION_ID)),
    )

    await runTaxonomyJob({ traceId, sessionId })

    const rows = await listClusterObservations()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sessionId).toBe(sessionId)
    expect(rows[0]?.assignmentMethod).toBe("centroid_online")
  })

  it("sweeps projects with enough observations and publishes throttled gardenProject jobs", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BehaviorObservationRepository
        for (let index = 100; index < 115; index++) {
          yield* repo.upsert(makeObservation(index))
        }
      }).pipe(withClickHouse(BehaviorObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
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
        const repo = yield* BehaviorObservationRepository
        for (let index = 200; index < 215; index++) {
          yield* repo.upsert({ ...makeObservation(index), projectId: PROJECT_ID_2 })
        }
      }).pipe(withClickHouse(BehaviorObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
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

  it("runs end-to-end gardening with births, names, lineage, categories, and follow-up merge", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BehaviorObservationRepository
        for (let index = 300; index < 304; index++) {
          yield* repo.upsert(makeObservation(index, PROJECT_ID_E2E))
        }
      }).pipe(withClickHouse(BehaviorObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
    )

    await Effect.runPromise(
      runGardenProjectJob(
        { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID_E2E, reason: "manual" },
        {
          clickhouseClient: ch.client,
          postgresClient: pg.appPostgresClient,
          redisClient: createFakeRedisClient() as never,
        },
      ),
    )

    const firstPass = await Effect.runPromise(
      Effect.gen(function* () {
        const clusters = yield* TaxonomyClusterRepository
        const categories = yield* TaxonomyCategoryRepository
        const lineage = yield* TaxonomyLineageRepository
        return {
          clusters: yield* clusters.listActiveByProject({ projectId: PROJECT_ID_E2E }),
          categories: yield* categories.listByProject({
            projectId: PROJECT_ID_E2E,
            state: "active",
          }),
          lineage: yield* lineage.listRecent({ projectId: PROJECT_ID_E2E, limit: 10 }),
        }
      }).pipe(
        withPostgres(
          Layer.mergeAll(TaxonomyCategoryRepositoryLive, TaxonomyClusterRepositoryLive, TaxonomyLineageRepositoryLive),
          pg.appPostgresClient,
          ORGANIZATION_ID,
        ),
      ),
    )

    expect(firstPass.clusters).toHaveLength(1)
    expect(firstPass.clusters[0]?.name).toBe("Cancellation")
    expect(firstPass.clusters[0]?.parentCategoryId).toBeTruthy()
    expect(firstPass.categories).toHaveLength(1)
    expect(firstPass.categories[0]?.name).toBe("Cancellation")
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

    await Effect.runPromise(
      runGardenProjectJob(
        { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID_E2E, reason: "manual" },
        {
          clickhouseClient: ch.client,
          postgresClient: pg.appPostgresClient,
          redisClient: createFakeRedisClient() as never,
        },
      ),
    )

    const secondPass = await Effect.runPromise(
      Effect.gen(function* () {
        const lineage = yield* TaxonomyLineageRepository
        const clusters = yield* TaxonomyClusterRepository
        return {
          lineage: yield* lineage.listRecent({ projectId: PROJECT_ID_E2E, limit: 10 }),
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

  it("adapts gardenProject reason into the taxonomy run trigger", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BehaviorObservationRepository
        for (const index of [10, 11, 12, 13]) {
          yield* repo.upsert(makeObservation(index))
        }
      }).pipe(withClickHouse(BehaviorObservationRepositoryLive, ch.client as ClickHouseClient, ORGANIZATION_ID)),
    )

    await Effect.runPromise(
      runGardenProjectJob(
        { organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, reason: "manual" },
        {
          clickhouseClient: ch.client,
          postgresClient: pg.appPostgresClient,
          redisClient: createFakeRedisClient() as never,
        },
      ),
    )

    const run = await listLatestTaxonomyRun()
    expect(run?.trigger).toBe("manual")
    expect(run?.status).toBe("completed")
  })
})
