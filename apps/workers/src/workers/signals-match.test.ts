import {
  buildLiveEvaluationExecuteTraceDedupeKey,
  defaultEvaluationTrigger,
  type EvaluationTurn,
  emptyEvaluationAlignment,
  evaluationSchema,
} from "@domain/evaluations"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { evaluationScoreSchema } from "@domain/scores"
import { createSignalCentroid } from "@domain/signals"
import type { RedisClient } from "@platform/cache-redis"
import { evaluations } from "@platform/db-postgres/schema/evaluations"
import { scores } from "@platform/db-postgres/schema/scores"
import { signals } from "@platform/db-postgres/schema/signals"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"
import { createRunHandler, createSignalsMatchWorker, runSignalsMatchJob } from "./signals-match.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = "o".repeat(24)
const PROJECT_ID = "p".repeat(24)
const TRACE_ID = "t".repeat(32)
const SESSION_ID = "session-1"
const API_KEY_ID = "k".repeat(24)
const SIGNAL_ID = "i".repeat(24)
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
  service_name: "signals-match-test",
  kind: 1,
  status_code: 1,
  status_message: "",
  error_type: "",
  tags: input?.tags ?? ["lifecycle"],
  metadata: {
    environment: "test",
    story: "signals-match-worker",
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
  resource_string: { "service.name": "signals-match-test" },
  scope_name: "openai-instrumentation",
  scope_version: "1.0.0",
})

const makeSignalRow = (input?: { readonly id?: string; readonly projectId?: string; readonly uuid?: string }) => ({
  id: input?.id ?? SIGNAL_ID,
  uuid: input?.uuid ?? "11111111-1111-4111-8111-111111111111",
  organizationId: ORGANIZATION_ID,
  projectId: input?.projectId ?? PROJECT_ID,
  slug: `signals-match-worker-issue-${(input?.id ?? SIGNAL_ID).slice(-6)}`,
  name: "Signals match worker issue",
  description: "Signal context for signals-match worker tests",
  source: "annotation" as const,
  centroid: createSignalCentroid(),
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
  readonly signalId?: string
}) =>
  evaluationSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId ?? PROJECT_ID,
    signalId: input.signalId ?? SIGNAL_ID,
    name: `evaluation-${input.id.slice(0, 6)}`,
    description: "Signals match worker live evaluation",
    script: "export default async function evaluate() { return { value: 1 } }",
    trigger: {
      ...defaultEvaluationTrigger(),
      filter: input.filter ?? {},
      sampling: input.sampling ?? 100,
      turn: input.turn ?? "every",
      debounce: 0,
    },
    alignment: emptyEvaluationAlignment("signals-match-worker-hash"),
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
  readonly signalId?: string
}) =>
  evaluationScoreSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId ?? PROJECT_ID,
    sessionId: input.sessionId ?? SESSION_ID,
    traceId: input.traceId ?? TRACE_ID,
    spanId: null,
    sourceType: "evaluation",
    sourceId: input.evaluationId,
    simulationId: null,
    signalId: input.signalId ?? SIGNAL_ID,
    value: 1,
    passed: true,
    feedback: "already scored",
    metadata: { evaluationHash: "signals-match-worker-hash" },
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

const insertTraceRows = async (rows: Array<Record<string, unknown>>) => {
  await ch.client.insert({
    table: "spans",
    values: rows,
    format: "JSONEachRow",
  })
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

describe("createSignalsMatchWorker", () => {
  it("registers the signals match task", () => {
    const consumer = new TestQueueConsumer()
    const { publisher } = createFakeQueuePublisher()
    const redisClient = createFakeRedisClient()

    createSignalsMatchWorker({
      consumer,
      publisher,
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      redisClient,
    })

    expect(consumer.getRegisteredTasks("signals")).toEqual(["match"])
  })
})

describe("runSignalsMatchJob", () => {
  it("skips when the trace no longer exists", async () => {
    const { publisher, published } = createFakeQueuePublisher()
    const redisClient = createFakeRedisClient()

    const result = await Effect.runPromise(
      runSignalsMatchJob({
        publisher,
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
  })

  it("skips evaluation work for sandbox traces (before loading the trace)", async () => {
    const { publisher, published } = createFakeQueuePublisher()
    const redisClient = createFakeRedisClient()

    const result = await Effect.runPromise(
      runSignalsMatchJob({
        publisher,
        postgresClient: pg.appPostgresClient,
        clickhouseClient: ch.client,
        redisClient,
      })({
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        isSandbox: true,
      }),
    )

    expect(result).toEqual({ action: "skipped", reason: "sandbox", traceId: TRACE_ID })
    expect(published).toEqual([])
  })
})

describe("runSignalsMatchJob", () => {
  it("selects active evaluations and publishes execute jobs for survivors", async () => {
    await insertTraceRows([makeTraceRow()])
    // One active evaluation per signal (active-detector index), so each evaluation
    // gets its own signal; the worker scans active evaluations project-wide.
    await pg.db
      .insert(signals)
      .values([
        makeSignalRow({ id: "i".repeat(24), uuid: "11111111-1111-4111-8111-111111111111" }),
        makeSignalRow({ id: "m".repeat(24), uuid: "44444444-4444-4444-8444-444444444444" }),
        makeSignalRow({ id: "n".repeat(24), uuid: "55555555-5555-4555-8555-555555555555" }),
      ])
    await pg.db.insert(evaluations).values([
      makeEvaluationRow({
        id: "e".repeat(24),
        signalId: "i".repeat(24),
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
      }),
      makeEvaluationRow({
        id: "f".repeat(24),
        signalId: "m".repeat(24),
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "first",
      }),
      makeEvaluationRow({
        id: "g".repeat(24),
        signalId: "n".repeat(24),
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        sampling: 0,
      }),
    ])
    const { sourceType, ...scoreRow } = makeScoreRow({
      id: "z".repeat(24),
      evaluationId: "f".repeat(24),
      signalId: "m".repeat(24),
    })
    await pg.db.insert(scores).values([{ ...scoreRow, sourceType: sourceType }])

    const { publisher, published } = createFakeQueuePublisher()
    const redisClient = createFakeRedisClient()

    const result = await Effect.runPromise(
      runSignalsMatchJob({
        publisher,
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
        selectedCount: 2,
        sampledOutCount: 0,
        filterMissCount: 0,
        activeEvaluationsScanned: 3,
        skippedIneligibleCount: 1,
        skippedTurnCount: 1,
        publishedExecuteCount: 1,
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

    const executePublishes = published.filter((p) => p.queue === "live-evaluations" && p.task === "execute")
    expect(executePublishes).toHaveLength(1)
  })
})

describe("createRunHandler", () => {
  it("logs the completed runtime summary", async () => {
    const projectId = "x".repeat(24)
    const traceId = "v".repeat(32)
    const signalId = "j".repeat(24)
    const sessionId = "session-2"

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        sessionId,
      }),
    ])
    await pg.db.insert(signals).values([
      makeSignalRow({
        id: signalId,
        projectId,
        uuid: "22222222-2222-4222-8222-222222222222",
      }),
    ])
    await pg.db.insert(evaluations).values([
      makeEvaluationRow({
        id: "h".repeat(24),
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        projectId,
        signalId,
      }),
    ])

    const { publisher } = createFakeQueuePublisher()
    const redisClient = createFakeRedisClient()
    const log = createMockLogger()

    await Effect.runPromise(
      createRunHandler({
        log,
        publisher,
        postgresClient: pg.appPostgresClient,
        clickhouseClient: ch.client,
        redisClient,
      })({
        organizationId: ORGANIZATION_ID,
        projectId,
        traceId,
      }),
    )

    expect(log.info).toHaveBeenCalledWith("Signals match completed", {
      queue: "signals",
      task: "match",
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
      outcome: "completed",
      sessionId,
      activeEvaluationsScanned: 1,
      skippedIneligibleCount: 0,
      skippedTurnCount: 0,
      publishedExecuteCount: 1,
    })
  })
})
