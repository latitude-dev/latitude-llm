import {
  buildLiveEvaluationExecuteTraceDedupeKey,
  defaultEvaluationTrigger,
  type EvaluationTurn,
  emptyEvaluationAlignment,
  evaluationSchema,
} from "@domain/evaluations"
import { createIssueCentroid } from "@domain/issues"
import type { WorkflowStarterShape } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { evaluationScoreSchema } from "@domain/scores"
import type { FilterSet } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import { annotationQueueItems, annotationQueues } from "@platform/db-postgres/schema/annotation-queues"
import { evaluations } from "@platform/db-postgres/schema/evaluations"
import { issues } from "@platform/db-postgres/schema/issues"
import { scores } from "@platform/db-postgres/schema/scores"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"

import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"

// vi.hoisted runs before imports, so we can't reference a constant here;
// the literal 2048 matches TRACE_SEARCH_EMBEDDING_DIMENSIONS (voyage-4-large).
const { mockAi } = vi.hoisted(() => ({
  mockAi: {
    generate: vi.fn(),
    embed: vi.fn().mockReturnValue({ embedding: new Array(2048).fill(0.1) }),
    rerank: vi.fn(),
  },
}))

vi.mock("@platform/ai", async () => {
  const { AI } = (await vi.importActual("@domain/ai")) as typeof import("@domain/ai")
  const { Effect: Eff, Layer } = (await vi.importActual("effect")) as typeof import("effect")

  // Matches the real signature: returning `Effect.provide(...)` directly
  // removes `AI` from the requirement channel, so call sites don't need casts.
  return {
    withAi: (_layer?: unknown, _redisClient?: unknown) => Eff.provide(Layer.succeed(AI, mockAi)),
  }
})

import { createRunHandler, createTraceEndWorker, runTraceEndJob } from "./trace-end.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = "o".repeat(24)
const PROJECT_ID = "p".repeat(24)
const TRACE_ID = "t".repeat(32)
const SESSION_ID = "session-1"
const API_KEY_ID = "k".repeat(24)
const ISSUE_ID = "i".repeat(24)
const TIMESTAMP = new Date("2026-04-15T12:00:00.000Z")

const toClickHouseTimestamp = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "000")

const toMessageJson = (role: "user" | "assistant", content: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content }] }])

const toSystemJson = (content: string) => JSON.stringify([{ type: "text", content }])

const makeTraceRow = (input?: {
  readonly traceId?: string
  readonly sessionId?: string
  readonly tags?: string[]
  readonly projectId?: string
}) => ({
  organization_id: ORGANIZATION_ID,
  project_id: input?.projectId ?? PROJECT_ID,
  session_id: input?.sessionId ?? SESSION_ID,
  user_id: "",
  trace_id: input?.traceId ?? TRACE_ID,
  span_id: "s".repeat(16),
  parent_span_id: "",
  api_key_id: API_KEY_ID,
  simulation_id: "",
  start_time: toClickHouseTimestamp(TIMESTAMP),
  end_time: toClickHouseTimestamp(new Date(TIMESTAMP.getTime() + 4_000)),
  name: "chat gpt-5.4",
  service_name: "trace-end-test",
  kind: 1,
  status_code: 1,
  status_message: "",
  error_type: "",
  tags: input?.tags ?? ["lifecycle"],
  metadata: {
    environment: "test",
    story: "trace-end-worker",
  },
  operation: "chat",
  provider: "openai",
  model: "gpt-5.4",
  response_model: "gpt-5.4",
  tokens_input: 64,
  tokens_output: 48,
  tokens_cache_read: 0,
  tokens_cache_create: 0,
  tokens_reasoning: 0,
  cost_input_microcents: 1_600,
  cost_output_microcents: 4_800,
  cost_total_microcents: 6_400,
  cost_is_estimated: 1,
  time_to_first_token_ns: 180_000_000,
  is_streaming: 0,
  response_id: "seed-response",
  finish_reasons: ["stop"],
  input_messages: toMessageJson("user", "Summarize the deployment checklist."),
  output_messages: toMessageJson("assistant", "Verify migrations, deploy, and monitor."),
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
  resource_string: { "service.name": "trace-end-test" },
  scope_name: "openai-instrumentation",
  scope_version: "1.0.0",
})

const makeIssueRow = (input?: { readonly id?: string; readonly projectId?: string; readonly uuid?: string }) => ({
  id: input?.id ?? ISSUE_ID,
  uuid: input?.uuid ?? "11111111-1111-4111-8111-111111111111",
  organizationId: ORGANIZATION_ID,
  projectId: input?.projectId ?? PROJECT_ID,
  name: "Trace-end worker issue",
  description: "Issue context for trace-end worker tests",
  centroid: createIssueCentroid(),
  clusteredAt: TIMESTAMP,
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
})

const makeEvaluationRow = (input: {
  readonly id: string
  readonly filter?: Record<string, unknown>
  readonly sampling?: number
  readonly turn?: EvaluationTurn
  readonly projectId?: string
  readonly issueId?: string
}) =>
  evaluationSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId ?? PROJECT_ID,
    issueId: input.issueId ?? ISSUE_ID,
    name: `evaluation-${input.id.slice(0, 6)}`,
    description: "Trace-end worker live evaluation",
    script: "export default async function evaluate() { return { value: 1 } }",
    trigger: {
      ...defaultEvaluationTrigger(),
      filter: input.filter ?? {},
      sampling: input.sampling ?? 100,
      turn: input.turn ?? "every",
      debounce: 0,
    },
    alignment: emptyEvaluationAlignment("trace-end-worker-hash"),
    alignedAt: TIMESTAMP,
    archivedAt: null,
    deletedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  })

const makeScoreRow = (input: {
  readonly id: string
  readonly evaluationId: string
  readonly projectId?: string
  readonly traceId?: string
  readonly sessionId?: string
  readonly issueId?: string
}) =>
  evaluationScoreSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId ?? PROJECT_ID,
    sessionId: input.sessionId ?? SESSION_ID,
    traceId: input.traceId ?? TRACE_ID,
    spanId: null,
    source: "evaluation",
    sourceId: input.evaluationId,
    simulationId: null,
    issueId: input.issueId ?? ISSUE_ID,
    value: 1,
    passed: true,
    feedback: "already scored",
    metadata: { evaluationHash: "trace-end-worker-hash" },
    error: null,
    errored: false,
    duration: 1_000_000,
    tokens: 100,
    cost: 50,
    draftedAt: null,
    annotatorId: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  })

const makeQueueRow = (input: {
  readonly id: string
  readonly slug: string
  readonly system: boolean
  readonly filter?: FilterSet
  readonly sampling?: number
  readonly projectId?: string
}): typeof annotationQueues.$inferInsert => ({
  id: input.id,
  organizationId: ORGANIZATION_ID,
  projectId: input.projectId ?? PROJECT_ID,
  system: input.system,
  name: `queue-${input.slug}`,
  slug: input.slug,
  description: "Trace-end worker queue",
  instructions: "Review traces",
  settings: {
    ...(input.filter ? { filter: input.filter } : {}),
    ...(input.sampling !== undefined ? { sampling: input.sampling } : {}),
  },
  assignees: [],
  totalItems: 0,
  completedItems: 0,
  deletedAt: null,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
})

const insertTraceRows = async (rows: Array<Record<string, unknown>>) => {
  await ch.client.insert({
    table: "spans",
    values: rows,
    format: "JSONEachRow",
  })
}

const createFakeWorkflowStarter = () => {
  const startedWorkflows: Array<{
    readonly workflow: string
    readonly input: unknown
    readonly options: { readonly workflowId: string }
  }> = []
  const workflowStarter: WorkflowStarterShape = {
    start: (workflow, input, options) =>
      Effect.sync(() => {
        startedWorkflows.push({ workflow, input, options })
      }),
    signalWithStart: () => Effect.die("signalWithStart should not be called by trace-end tests"),
  }

  return { workflowStarter, startedWorkflows }
}

const createFakeRedisClient = (): RedisClient => {
  const values = new Map<string, string>()
  const sets = new Map<string, Set<string>>()

  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => {
      values.set(key, value)
      return "OK"
    },
    del: async (key: string) => {
      values.delete(key)
      sets.delete(key)
      return 1
    },
    sismember: async (key: string, member: string) => (sets.get(key)?.has(member) ? 1 : 0),
    scard: async (key: string) => sets.get(key)?.size ?? 0,
    smembers: async (key: string) => [...(sets.get(key) ?? new Set<string>())],
    multi: () => {
      const operations: Array<() => void> = []
      const multi = {
        sadd: (key: string, member: string) => {
          operations.push(() => {
            const existing = sets.get(key) ?? new Set<string>()
            existing.add(member)
            sets.set(key, existing)
          })
          return multi
        },
        expire: () => multi,
        exec: async () => {
          for (const operation of operations) {
            operation()
          }
          return []
        },
      }

      return multi
    },
  } as unknown as RedisClient
}

describe("createTraceEndWorker", () => {
  it("registers the trace-end run task", () => {
    const consumer = new TestQueueConsumer()
    const { publisher } = createFakeQueuePublisher()
    const { workflowStarter } = createFakeWorkflowStarter()
    const redisClient = createFakeRedisClient()

    createTraceEndWorker({
      consumer,
      publisher,
      workflowStarter,
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      redisClient,
    })

    expect(consumer.getRegisteredTasks("trace-end")).toEqual(["run"])
  })
})

describe("runTraceEndJob", () => {
  it("skips when the trace no longer exists", async () => {
    const { publisher, published } = createFakeQueuePublisher()
    const { workflowStarter, startedWorkflows } = createFakeWorkflowStarter()
    const redisClient = createFakeRedisClient()

    const result = await Effect.runPromise(
      runTraceEndJob({
        publisher,
        workflowStarter,
        postgresClient: pg.appPostgresClient,
        clickhouseClient: ch.client,
        redisClient,
      })({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      }),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "trace-not-found",
      traceId: TRACE_ID,
    })
    expect(published).toEqual([])
    expect(startedWorkflows).toEqual([])
  })
})

describe("runTraceEndJob", () => {
  it("selects and applies live evaluations, live queues, and system queues", async () => {
    await insertTraceRows([makeTraceRow()])
    await pg.db.insert(issues).values([makeIssueRow()])
    await pg.db.insert(evaluations).values([
      makeEvaluationRow({
        id: "e".repeat(24),
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
      }),
      makeEvaluationRow({
        id: "f".repeat(24),
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "first",
      }),
      makeEvaluationRow({
        id: "g".repeat(24),
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        sampling: 0,
      }),
    ])
    await pg.db.insert(annotationQueues).values([
      makeQueueRow({
        id: "q".repeat(24),
        slug: "live-selected",
        system: false,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        sampling: 100,
      }),
      makeQueueRow({
        id: "r".repeat(24),
        slug: "live-miss",
        system: false,
        filter: { tags: [{ op: "in", value: ["annotation"] }] },
        sampling: 100,
      }),
      makeQueueRow({
        id: "s".repeat(24),
        slug: "system-selected",
        system: true,
        sampling: 100,
      }),
      makeQueueRow({
        id: "u".repeat(24),
        slug: "system-sampled-out",
        system: true,
        sampling: 0,
      }),
    ])
    await pg.db.insert(scores).values([makeScoreRow({ id: "z".repeat(24), evaluationId: "f".repeat(24) })])

    const { publisher, published } = createFakeQueuePublisher()
    const { workflowStarter, startedWorkflows } = createFakeWorkflowStarter()
    const redisClient = createFakeRedisClient()

    const result = await Effect.runPromise(
      runTraceEndJob({
        publisher,
        workflowStarter,
        postgresClient: pg.appPostgresClient,
        clickhouseClient: ch.client,
        redisClient,
      })({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
      }),
    )

    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: TRACE_ID,
        sessionId: SESSION_ID,
        evaluations: {
          activeEvaluationsScanned: 3,
          selectedCount: 2,
          sampledOutCount: 0,
          filterMissCount: 0,
          skippedIneligibleCount: 1,
          skippedTurnCount: 1,
          publishedExecuteCount: 1,
        },
        liveQueues: {
          liveQueuesScanned: 2,
          selectedCount: 1,
          sampledOutCount: 0,
          filterMissCount: 1,
          insertedItemCount: 1,
        },
        systemQueues: {
          systemQueuesScanned: 2,
          selectedCount: 1,
          sampledOutCount: 1,
          filterMissCount: 0,
          startedWorkflowCount: 1,
        },
        deterministicSystemMatches: {
          matchedSlugs: [],
        },
      },
    })

    expect(published).toEqual(
      expect.arrayContaining([
        {
          queue: "live-evaluations",
          task: "execute",
          payload: {
            organizationId: ORGANIZATION_ID,
            projectId: PROJECT_ID,
            evaluationId: "e".repeat(24),
            traceId: TRACE_ID,
          },
          options: {
            dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
              organizationId: ORGANIZATION_ID,
              projectId: PROJECT_ID,
              evaluationId: "e".repeat(24),
              traceId: TRACE_ID,
            }),
          },
        },
      ]),
    )

    expect(startedWorkflows).toEqual([
      {
        workflow: "systemQueueFlaggerWorkflow",
        input: {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          queueSlug: "system-selected",
        },
        options: {
          workflowId: "system-queue-flagger:tttttttttttttttttttttttttttttttt:system-selected",
        },
      },
    ])

    const queueItems = await pg.db.select().from(annotationQueueItems)
    expect(queueItems).toHaveLength(1)
    expect(queueItems[0]?.queueId).toBe("q".repeat(24))
    expect(queueItems[0]?.traceId).toBe(TRACE_ID)

    const persistedQueues = await pg.db.select().from(annotationQueues)
    const selectedQueue = persistedQueues.find((queue) => queue.id === "q".repeat(24))
    const missedQueue = persistedQueues.find((queue) => queue.id === "r".repeat(24))
    expect(selectedQueue?.totalItems).toBe(1)
    expect(missedQueue?.totalItems).toBe(0)

    // Verify trace-search refresh task was published
    const traceSearchPublish = published.find((p) => p.queue === "trace-search")
    expect(traceSearchPublish?.task).toBe("refreshTrace")
    expect(traceSearchPublish?.payload).toMatchObject({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
    })
  })
})

describe("createRunHandler", () => {
  it("logs the completed runtime summary", async () => {
    const projectId = "x".repeat(24)
    const traceId = "v".repeat(32)
    const issueId = "j".repeat(24)
    const sessionId = "session-2"

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        sessionId,
      }),
    ])
    await pg.db.insert(issues).values([
      makeIssueRow({
        id: issueId,
        projectId,
        uuid: "22222222-2222-4222-8222-222222222222",
      }),
    ])
    await pg.db.insert(evaluations).values([
      makeEvaluationRow({
        id: "h".repeat(24),
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        projectId,
        issueId,
      }),
    ])
    await pg.db.insert(annotationQueues).values([
      makeQueueRow({
        id: "m".repeat(24),
        slug: "live-selected",
        system: false,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        sampling: 100,
        projectId,
      }),
      makeQueueRow({
        id: "n".repeat(24),
        slug: "system-selected",
        system: true,
        sampling: 100,
        projectId,
      }),
    ])

    const { publisher } = createFakeQueuePublisher()
    const { workflowStarter } = createFakeWorkflowStarter()
    const redisClient = createFakeRedisClient()
    const log = createMockLogger()

    await Effect.runPromise(
      createRunHandler({
        log,
        publisher,
        workflowStarter,
        postgresClient: pg.appPostgresClient,
        clickhouseClient: ch.client,
        redisClient,
      })({
        organizationId: ORGANIZATION_ID,
        projectId,
        traceId,
      }),
    )

    expect(log.info).toHaveBeenCalledWith("Trace-end runtime completed", {
      queue: "trace-end",
      task: "run",
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
      outcome: "completed",
      sessionId,
      evaluations: {
        activeEvaluationsScanned: 1,
        selectedCount: 1,
        sampledOutCount: 0,
        filterMissCount: 0,
        skippedIneligibleCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 1,
      },
      liveQueues: {
        liveQueuesScanned: 1,
        selectedCount: 1,
        sampledOutCount: 0,
        filterMissCount: 0,
        insertedItemCount: 1,
      },
      systemQueues: {
        systemQueuesScanned: 1,
        selectedCount: 1,
        sampledOutCount: 0,
        filterMissCount: 0,
        startedWorkflowCount: 1,
      },
      deterministicSystemMatches: {
        matchedSlugs: [],
      },
    })
  })
})
