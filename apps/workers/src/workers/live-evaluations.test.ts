import {
  buildLiveEvaluationExecuteScopeDedupeKey,
  buildLiveEvaluationExecuteTraceDedupeKey,
  defaultEvaluationTrigger,
  type EvaluationTurn,
  emptyEvaluationAlignment,
  evaluationSchema,
  shouldSampleLiveEvaluation,
  toLiveEvaluationDebounceMs,
} from "@domain/evaluations"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { scoreSchema } from "@domain/scores"
import { evaluations } from "@platform/db-postgres/schema/evaluations"
import { scores } from "@platform/db-postgres/schema/scores"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createLiveEvaluationsWorker } from "./live-evaluations.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = "o".repeat(24)
const ISSUE_ID = "i".repeat(24)
const API_KEY_ID = "k".repeat(24)
const TIMESTAMP = new Date("2026-04-10T12:00:00.000Z")
const NON_SAMPLED_EVALUATION_ALPHABET = "klmnopqrstuvwxyz"

const fill = (character: string, length: number) => character.repeat(length)

const toClickHouseTimestamp = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "000")

const toMessageJson = (role: "user" | "assistant", content: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content }] }])

const toSystemJson = (content: string) => JSON.stringify([{ type: "text", content }])

const makeTraceRow = (input: {
  readonly projectId: string
  readonly traceId: string
  readonly spanId: string
  readonly sessionId?: string
  readonly tags?: string[]
}) => ({
  organization_id: ORGANIZATION_ID,
  project_id: input.projectId,
  session_id: input.sessionId ?? "",
  user_id: "",
  trace_id: input.traceId,
  span_id: input.spanId,
  parent_span_id: "",
  api_key_id: API_KEY_ID,
  simulation_id: "",
  start_time: toClickHouseTimestamp(TIMESTAMP),
  end_time: toClickHouseTimestamp(new Date(TIMESTAMP.getTime() + 4_000)),
  name: "chat gpt-4o",
  service_name: "acme-support-agent",
  kind: 1,
  status_code: 1,
  status_message: "",
  error_type: "",
  tags: input.tags ?? ["lifecycle"],
  metadata: {
    environment: "production",
    story: "live-evaluations-worker-test",
  },
  operation: "chat",
  provider: "openai",
  model: "gpt-4o",
  response_model: "gpt-4o-2024-08-06",
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
  response_id: `seed-${input.spanId}`,
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
  resource_string: { "service.name": "acme-support-agent" },
  scope_name: "openai-instrumentation",
  scope_version: "1.0.0",
})

const makeEvaluationRow = (input: {
  readonly id: string
  readonly projectId: string
  readonly filter?: Record<string, unknown>
  readonly sampling?: number
  readonly turn?: EvaluationTurn
  readonly debounce?: number
}) =>
  evaluationSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId,
    issueId: ISSUE_ID,
    name: `evaluation-${input.id.slice(0, 6)}`,
    description: "Worker test live evaluation",
    script: "export default async function evaluate() { return { value: 1 } }",
    trigger: {
      ...defaultEvaluationTrigger(),
      filter: input.filter ?? {},
      sampling: input.sampling ?? 100,
      turn: input.turn ?? "every",
      debounce: input.debounce ?? 0,
    },
    alignment: emptyEvaluationAlignment("worker-test-hash"),
    alignedAt: TIMESTAMP,
    archivedAt: null,
    deletedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  })

const makeScoreRow = (input: {
  readonly id: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
  readonly sessionId?: string | null
}) =>
  scoreSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId,
    sessionId: input.sessionId ?? null,
    traceId: input.traceId,
    spanId: null,
    source: "evaluation",
    sourceId: input.evaluationId,
    simulationId: null,
    issueId: null,
    value: 0.95,
    passed: true,
    feedback: "already scored",
    metadata: { evaluationHash: "worker-test-hash" },
    error: null,
    errored: false,
    duration: 1_000_000,
    tokens: 200,
    cost: 500,
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

const insertEvaluations = async (rows: Array<ReturnType<typeof makeEvaluationRow>>) => {
  await pg.db.insert(evaluations).values(rows)
}

const insertScores = async (rows: Array<ReturnType<typeof makeScoreRow>>) => {
  await pg.db.insert(scores).values(rows)
}

const setupWorker = (options?: {
  readonly runLiveEvaluation?: Parameters<typeof createLiveEvaluationsWorker>[0]["runLiveEvaluation"]
}) => {
  const consumer = new TestQueueConsumer()
  const { publisher, published } = createFakeQueuePublisher()

  createLiveEvaluationsWorker({
    consumer,
    publisher,
    postgresClient: pg.appPostgresClient,
    clickhouseClient: ch.client,
    ...(options?.runLiveEvaluation ? { runLiveEvaluation: options.runLiveEvaluation } : {}),
  })

  return { consumer, published }
}

async function findNonSampledEvaluationId(input: {
  readonly projectId: string
  readonly traceId: string
  readonly excludedIds?: ReadonlySet<string>
}): Promise<string> {
  for (const character of NON_SAMPLED_EVALUATION_ALPHABET) {
    const evaluationId = character.repeat(24)
    if (input.excludedIds?.has(evaluationId)) {
      continue
    }

    const shouldSample = await shouldSampleLiveEvaluation({
      organizationId: ORGANIZATION_ID,
      projectId: input.projectId,
      evaluationId,
      traceId: input.traceId,
      sampling: 1,
    })

    if (!shouldSample) {
      return evaluationId
    }
  }

  throw new Error("Expected a non-sampled evaluation id for worker sampling coverage")
}

describe("createLiveEvaluationsWorker", () => {
  it("routes execute tasks through runLiveEvaluationUseCase", async () => {
    const projectId = fill("u", 24)
    const traceId = fill("g", 32)
    const evaluationId = fill("j", 24)
    const payload = {
      organizationId: ORGANIZATION_ID,
      projectId,
      evaluationId,
      traceId,
    }
    const handledPayloads: unknown[] = []
    const { consumer, published } = setupWorker({
      runLiveEvaluation: (input) =>
        Effect.sync(() => {
          handledPayloads.push(input)
          return {
            action: "skipped" as const,
            reason: "result-already-exists" as const,
            evaluationId: input.evaluationId,
            traceId: input.traceId,
          }
        }),
    })

    await consumer.dispatchTask("live-evaluations", "execute", {
      ...payload,
    })

    expect(handledPayloads).toEqual([payload])
    expect(published).toEqual([])
  })

  it("publishes only matching eligible evaluations and skips paused, filter-mismatched, and non-sampled ones", async () => {
    const projectId = fill("p", 24)
    const traceId = fill("a", 32)
    const matchingEvaluationId = fill("a", 24)
    const pausedEvaluationId = fill("b", 24)
    const mismatchedEvaluationId = fill("c", 24)
    const nonSampledEvaluationId = await findNonSampledEvaluationId({
      projectId,
      traceId,
      excludedIds: new Set([matchingEvaluationId, pausedEvaluationId, mismatchedEvaluationId]),
    })

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        spanId: fill("a", 16),
        tags: ["lifecycle"],
      }),
    ])
    await insertEvaluations([
      makeEvaluationRow({
        id: matchingEvaluationId,
        projectId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
      }),
      makeEvaluationRow({
        id: pausedEvaluationId,
        projectId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        sampling: 0,
      }),
      makeEvaluationRow({
        id: mismatchedEvaluationId,
        projectId,
        filter: { tags: [{ op: "in", value: ["annotation"] }] },
      }),
      makeEvaluationRow({
        id: nonSampledEvaluationId,
        projectId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        sampling: 1,
      }),
    ])

    const { consumer, published } = setupWorker()

    await consumer.dispatchTask("live-evaluations", "enqueue", {
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
    })

    expect(published).toEqual([
      {
        queue: "live-evaluations",
        task: "execute",
        payload: {
          organizationId: ORGANIZATION_ID,
          projectId,
          evaluationId: matchingEvaluationId,
          traceId,
        },
        options: {
          dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
            organizationId: ORGANIZATION_ID,
            projectId,
            evaluationId: matchingEvaluationId,
            traceId,
          }),
        },
      },
    ])
  })

  it("publishes debounced every-turn tasks using session scope when the trace has a session id", async () => {
    const projectId = fill("q", 24)
    const traceId = fill("b", 32)
    const evaluationId = fill("d", 24)
    const sessionId = "session-live-evaluations-worker"
    const debounceSeconds = 15

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        spanId: fill("b", 16),
        sessionId,
        tags: ["lifecycle"],
      }),
    ])
    await insertEvaluations([
      makeEvaluationRow({
        id: evaluationId,
        projectId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "every",
        debounce: debounceSeconds,
      }),
    ])

    const { consumer, published } = setupWorker()

    await consumer.dispatchTask("live-evaluations", "enqueue", {
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
    })

    expect(published).toEqual([
      {
        queue: "live-evaluations",
        task: "execute",
        payload: {
          organizationId: ORGANIZATION_ID,
          projectId,
          evaluationId,
          traceId,
        },
        options: {
          dedupeKey: buildLiveEvaluationExecuteScopeDedupeKey({
            organizationId: ORGANIZATION_ID,
            projectId,
            evaluationId,
            traceId,
            sessionId,
          }),
          debounceMs: toLiveEvaluationDebounceMs(debounceSeconds),
        },
      },
    ])
  })

  it("publishes debounced every-turn tasks using trace scope when the trace has no session id", async () => {
    const projectId = fill("r", 24)
    const traceId = fill("c", 32)
    const evaluationId = fill("e", 24)
    const debounceSeconds = 20

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        spanId: fill("c", 16),
        tags: ["lifecycle"],
      }),
    ])
    await insertEvaluations([
      makeEvaluationRow({
        id: evaluationId,
        projectId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "every",
        debounce: debounceSeconds,
      }),
    ])

    const { consumer, published } = setupWorker()

    await consumer.dispatchTask("live-evaluations", "enqueue", {
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
    })

    expect(published).toEqual([
      {
        queue: "live-evaluations",
        task: "execute",
        payload: {
          organizationId: ORGANIZATION_ID,
          projectId,
          evaluationId,
          traceId,
        },
        options: {
          dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
            organizationId: ORGANIZATION_ID,
            projectId,
            evaluationId,
            traceId,
          }),
          debounceMs: toLiveEvaluationDebounceMs(debounceSeconds),
        },
      },
    ])
  })

  it("skips first-turn evaluations when a canonical score already exists in the current session scope", async () => {
    const projectId = fill("s", 24)
    const traceId = fill("d", 32)
    const priorTraceId = fill("e", 32)
    const evaluationId = fill("f", 24)
    const sessionId = "session-live-evaluations-first-turn"

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        spanId: fill("d", 16),
        sessionId,
        tags: ["lifecycle"],
      }),
    ])
    await insertEvaluations([
      makeEvaluationRow({
        id: evaluationId,
        projectId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "first",
      }),
    ])
    await insertScores([
      makeScoreRow({
        id: fill("g", 24),
        projectId,
        evaluationId,
        traceId: priorTraceId,
        sessionId,
      }),
    ])

    const { consumer, published } = setupWorker()

    await consumer.dispatchTask("live-evaluations", "enqueue", {
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
    })

    expect(published).toEqual([])
  })

  it("publishes last-turn evaluations as scope-scoped debounced execute tasks", async () => {
    const projectId = fill("t", 24)
    const traceId = fill("f", 32)
    const evaluationId = fill("h", 24)
    const sessionId = "session-live-evaluations-last-turn"
    const debounceSeconds = 30

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        spanId: fill("e", 16),
        sessionId,
        tags: ["lifecycle"],
      }),
    ])
    await insertEvaluations([
      makeEvaluationRow({
        id: evaluationId,
        projectId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "last",
        debounce: debounceSeconds,
      }),
    ])

    const { consumer, published } = setupWorker()

    await consumer.dispatchTask("live-evaluations", "enqueue", {
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
    })

    expect(published).toEqual([
      {
        queue: "live-evaluations",
        task: "execute",
        payload: {
          organizationId: ORGANIZATION_ID,
          projectId,
          evaluationId,
          traceId,
        },
        options: {
          dedupeKey: buildLiveEvaluationExecuteScopeDedupeKey({
            organizationId: ORGANIZATION_ID,
            projectId,
            evaluationId,
            traceId,
            sessionId,
          }),
          debounceMs: toLiveEvaluationDebounceMs(debounceSeconds),
        },
      },
    ])
  })
})
