import {
  buildLiveEvaluationExecuteScopeDedupeKey,
  buildLiveEvaluationExecuteTraceDedupeKey,
  defaultEvaluationTrigger,
  type EvaluationTurn,
  emptyEvaluationAlignment,
  evaluationSchema,
  type RunLiveEvaluationResult,
  shouldSampleLiveEvaluation,
  toLiveEvaluationDebounceMs,
} from "@domain/evaluations"
import { createIssueCentroid } from "@domain/issues"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { evaluationScoreSchema } from "@domain/scores"
import type { RedisClient } from "@platform/cache-redis"
import { queryClickhouse } from "@platform/db-clickhouse"
import { evaluations } from "@platform/db-postgres/schema/evaluations"
import { issues } from "@platform/db-postgres/schema/issues"
import { scores } from "@platform/db-postgres/schema/scores"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createLiveEvaluationsWorker } from "./live-evaluations.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = "o".repeat(24)
const ISSUE_ID = "i".repeat(24)
const API_KEY_ID = "k".repeat(24)
const TIMESTAMP = new Date("2026-04-10T12:00:00.000Z")
const NON_SAMPLED_EVALUATION_ALPHABET = "klmnopqrstuvwxyz"
const DUMMY_REDIS_CLIENT = {} as RedisClient

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
  readonly script?: string
}) =>
  evaluationSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId,
    issueId: ISSUE_ID,
    name: `evaluation-${input.id.slice(0, 6)}`,
    description: "Worker test live evaluation",
    script: input.script ?? "export default async function evaluate() { return { value: 1 } }",
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

const makeIssueRow = (input: { readonly id?: string; readonly projectId: string }) => ({
  id: input.id ?? ISSUE_ID,
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId: ORGANIZATION_ID,
  projectId: input.projectId,
  name: "Worker test issue",
  description: "Worker test issue context",
  centroid: createIssueCentroid(),
  clusteredAt: TIMESTAMP,
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
})

const makeScoreRow = (input: {
  readonly id: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
  readonly sessionId?: string | null
  readonly issueId?: string | null
  readonly passed?: boolean
  readonly feedback?: string
  readonly error?: string | null
  readonly errored?: boolean
  readonly duration?: number
  readonly tokens?: number
  readonly cost?: number
}) =>
  evaluationScoreSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId,
    sessionId: input.sessionId ?? null,
    traceId: input.traceId,
    spanId: null,
    source: "evaluation",
    sourceId: input.evaluationId,
    simulationId: null,
    issueId: input.issueId ?? null,
    value: input.passed === false ? 0 : 0.95,
    passed: input.passed ?? true,
    feedback: input.feedback ?? "already scored",
    metadata: { evaluationHash: "worker-test-hash" },
    error: input.error ?? null,
    errored: input.errored ?? false,
    duration: input.duration ?? 1_000_000,
    tokens: input.tokens ?? 200,
    cost: input.cost ?? 500,
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

const insertIssues = async (rows: Array<ReturnType<typeof makeIssueRow>>) => {
  await pg.db.insert(issues).values(rows)
}

const insertScores = async (rows: Array<ReturnType<typeof makeScoreRow>>) => {
  await pg.db.insert(scores).values(rows)
}

const queryAnalyticsScores = (organizationId: string, scoreId: string) =>
  Effect.runPromise(
    queryClickhouse<{ id: string }>(
      ch.client,
      `SELECT id
       FROM scores
       WHERE organization_id = {organizationId:String}
         AND id = {scoreId:FixedString(24)}`,
      { organizationId, scoreId },
    ),
  ).then((rows: ReadonlyArray<{ id: string }>) =>
    rows.map((row: { id: string }) => ({
      ...row,
      id: row.id.replace(/\0+$/u, ""),
    })),
  )

const setupWorker = (options?: {
  readonly runLiveEvaluation?: Parameters<typeof createLiveEvaluationsWorker>[0]["runLiveEvaluation"]
  readonly logger?: Parameters<typeof createLiveEvaluationsWorker>[0]["logger"]
  readonly redisClient?: Parameters<typeof createLiveEvaluationsWorker>[0]["redisClient"]
}) => {
  const consumer = new TestQueueConsumer()
  const { publisher, published } = createFakeQueuePublisher()

  createLiveEvaluationsWorker({
    consumer,
    publisher,
    postgresClient: pg.appPostgresClient,
    clickhouseClient: ch.client,
    ...(options?.runLiveEvaluation ? { runLiveEvaluation: options.runLiveEvaluation } : {}),
    ...(options?.logger ? { logger: options.logger } : {}),
    ...(options?.redisClient ? { redisClient: options.redisClient } : {}),
  })

  return { consumer, published }
}

const makePersistedExecuteResult = (input: {
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
  readonly scoreId: string
  readonly sessionId?: string | null
  readonly issueId?: string | null
  readonly passed?: boolean
  readonly feedback?: string
  readonly error?: string | null
  readonly errored?: boolean
  readonly duration?: number
  readonly tokens?: number
  readonly cost?: number
}): Extract<RunLiveEvaluationResult, { readonly action: "persisted" }> => {
  const score = makeScoreRow({
    id: input.scoreId,
    projectId: input.projectId,
    evaluationId: input.evaluationId,
    traceId: input.traceId,
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.issueId !== undefined ? { issueId: input.issueId } : {}),
    ...(input.passed !== undefined ? { passed: input.passed } : {}),
    ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
    ...(input.error !== undefined ? { error: input.error } : {}),
    ...(input.errored !== undefined ? { errored: input.errored } : {}),
    ...(input.duration !== undefined ? { duration: input.duration } : {}),
    ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
    ...(input.cost !== undefined ? { cost: input.cost } : {}),
  })

  return {
    action: "persisted",
    summary: {
      evaluationId: input.evaluationId,
      issueId: ISSUE_ID,
      traceId: input.traceId,
      sessionId: input.sessionId ?? null,
      scoreId: input.scoreId,
    },
    context: {
      evaluation: makeEvaluationRow({
        id: input.evaluationId,
        projectId: input.projectId,
      }),
      traceDetail: {} as never,
      issue: {
        name: "Live evaluation issue",
        description: "Worker test issue context",
      },
      execution: {} as never,
      score,
    },
  }
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
  it("logs structured execute details for persisted result kinds", async () => {
    const cases = [
      {
        name: "passed",
        projectId: fill("u", 24),
        traceId: fill("g", 32),
        evaluationId: fill("j", 24),
        scoreId: fill("s", 24),
        sessionId: "session-passed",
        passed: true,
        errored: false,
        issueId: null,
        feedback: "Passed live monitor result",
        error: null,
        tokens: 120,
        cost: 6_400,
        duration: 456_000_000,
        expected: {
          resultKind: "passed",
          issueAssignmentPath: "none",
          hasSessionId: true,
        },
      },
      {
        name: "failed-direct",
        projectId: fill("v", 24),
        traceId: fill("h", 32),
        evaluationId: fill("k", 24),
        scoreId: fill("t", 24),
        sessionId: "session-failed",
        passed: false,
        errored: false,
        issueId: ISSUE_ID,
        feedback: "Failed live monitor result",
        error: null,
        tokens: 140,
        cost: 7_500,
        duration: 512_000_000,
        expected: {
          resultKind: "failed",
          issueAssignmentPath: "direct",
          hasSessionId: true,
        },
      },
      {
        name: "errored",
        projectId: fill("w", 24),
        traceId: fill("i", 32),
        evaluationId: fill("l", 24),
        scoreId: fill("r", 24),
        sessionId: null,
        passed: false,
        errored: true,
        issueId: null,
        feedback: "AI generation failed",
        error: "AI generation failed",
        tokens: 0,
        cost: 0,
        duration: 321_000_000,
        expected: {
          resultKind: "errored",
          issueAssignmentPath: "none",
          hasSessionId: false,
        },
      },
      {
        name: "passed-empty-session-id",
        projectId: fill("y", 24),
        traceId: fill("j", 32),
        evaluationId: fill("m", 24),
        scoreId: fill("q", 24),
        sessionId: "",
        passed: true,
        errored: false,
        issueId: null,
        feedback: "Passed live monitor result with empty session id",
        error: null,
        tokens: 160,
        cost: 8_100,
        duration: 612_000_000,
        expected: {
          resultKind: "passed",
          issueAssignmentPath: "none",
          hasSessionId: true,
        },
      },
    ] as const

    for (const testCase of cases) {
      const logger = {
        info: vi.fn(),
        error: vi.fn(),
      }
      const payload = {
        organizationId: ORGANIZATION_ID,
        projectId: testCase.projectId,
        evaluationId: testCase.evaluationId,
        traceId: testCase.traceId,
      }
      const result = makePersistedExecuteResult({
        projectId: testCase.projectId,
        evaluationId: testCase.evaluationId,
        traceId: testCase.traceId,
        scoreId: testCase.scoreId,
        sessionId: testCase.sessionId,
        issueId: testCase.issueId,
        passed: testCase.passed,
        feedback: testCase.feedback,
        error: testCase.error ?? null,
        errored: testCase.errored,
        duration: testCase.duration,
        tokens: testCase.tokens,
        cost: testCase.cost,
      })
      const { consumer } = setupWorker({
        logger,
        runLiveEvaluation: () => Effect.succeed(result),
      })

      await consumer.dispatchTask("live-evaluations", "execute", payload)

      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledTimes(1)

      const [message, context] = logger.info.mock.calls[0] ?? []
      expect(message).toBe("Live evaluation execute completed")
      expect(context).toMatchObject({
        queue: "live-evaluations",
        task: "execute",
        organizationId: ORGANIZATION_ID,
        projectId: testCase.projectId,
        evaluationId: testCase.evaluationId,
        traceId: testCase.traceId,
        outcome: "persisted",
        resultKind: testCase.expected.resultKind,
        scoreId: testCase.scoreId,
        issueAssignmentPath: testCase.expected.issueAssignmentPath,
        tokens: testCase.tokens,
        cost: testCase.cost,
        duration: testCase.duration,
      })

      if (testCase.expected.hasSessionId) {
        expect(context).toMatchObject({ sessionId: testCase.sessionId })
      } else {
        expect(context).not.toHaveProperty("sessionId")
      }
    }
  })

  it("logs structured execute skip details", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    }
    const projectId = fill("x", 24)
    const traceId = fill("m", 32)
    const evaluationId = fill("n", 24)
    const { consumer } = setupWorker({
      logger,
      runLiveEvaluation: (input) =>
        Effect.succeed({
          action: "skipped",
          reason: "result-already-exists",
          evaluationId: input.evaluationId,
          traceId: input.traceId,
        }),
    })

    await consumer.dispatchTask("live-evaluations", "execute", {
      organizationId: ORGANIZATION_ID,
      projectId,
      evaluationId,
      traceId,
    })

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith("Live evaluation execute skipped", {
      queue: "live-evaluations",
      task: "execute",
      organizationId: ORGANIZATION_ID,
      projectId,
      evaluationId,
      traceId,
      outcome: "skipped",
      resultKind: "skipped",
      reason: "result-already-exists",
    })
  })

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

  it("skips duplicate execute tasks through the default worker path before writing another score", async () => {
    const projectId = fill("y", 24)
    const traceId = fill("o", 32)
    const evaluationId = fill("p", 24)
    const existingScoreId = fill("q", 24)
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    }

    await insertEvaluations([
      makeEvaluationRow({
        id: evaluationId,
        projectId,
      }),
    ])
    await insertScores([
      makeScoreRow({
        id: existingScoreId,
        projectId,
        evaluationId,
        traceId,
        sessionId: "session-live-execute-duplicate",
      }),
    ])

    const { consumer } = setupWorker({
      logger,
      redisClient: DUMMY_REDIS_CLIENT,
    })

    await consumer.dispatchTask("live-evaluations", "execute", {
      organizationId: ORGANIZATION_ID,
      projectId,
      evaluationId,
      traceId,
    })

    const persistedScores = (await pg.db.select().from(scores)).filter(
      (score) => score.sourceId === evaluationId && score.traceId === traceId,
    )

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.id).toBe(existingScoreId)
    expect(await queryAnalyticsScores(ORGANIZATION_ID, existingScoreId)).toEqual([])
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith("Live evaluation execute skipped", {
      queue: "live-evaluations",
      task: "execute",
      organizationId: ORGANIZATION_ID,
      projectId,
      evaluationId,
      traceId,
      outcome: "skipped",
      resultKind: "skipped",
      reason: "result-already-exists",
    })
  })

  it("persists errored live evaluation scores and analytics through the default worker path", async () => {
    const projectId = fill("z", 24)
    const traceId = fill("p", 32)
    const evaluationId = fill("q", 24)
    const sessionId = "session-live-execute-invalid-script"
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    }

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        spanId: fill("p", 16),
        sessionId,
      }),
    ])
    await insertEvaluations([
      makeEvaluationRow({
        id: evaluationId,
        projectId,
        script: "const result = 'invalid runtime'",
      }),
    ])
    await insertIssues([
      makeIssueRow({
        projectId,
      }),
    ])

    const { consumer } = setupWorker({
      logger,
      redisClient: DUMMY_REDIS_CLIENT,
    })

    await consumer.dispatchTask("live-evaluations", "execute", {
      organizationId: ORGANIZATION_ID,
      projectId,
      evaluationId,
      traceId,
    })

    const persistedScores = (await pg.db.select().from(scores)).filter(
      (score) => score.sourceId === evaluationId && score.traceId === traceId,
    )

    expect(persistedScores).toHaveLength(1)

    const [persistedScore] = persistedScores
    if (!persistedScore) throw new Error("Expected a persisted worker score")

    expect(persistedScore).toMatchObject({
      organizationId: ORGANIZATION_ID,
      projectId,
      sessionId,
      traceId,
      source: "evaluation",
      sourceId: evaluationId,
      issueId: null,
      passed: false,
      errored: true,
      error: "Stored evaluation script is not executable by the MVP live evaluation runtime",
      feedback: "Stored evaluation script is not executable by the MVP live evaluation runtime",
      tokens: 0,
      cost: 0,
    })
    expect(await queryAnalyticsScores(ORGANIZATION_ID, persistedScore.id)).toEqual([{ id: persistedScore.id }])
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      "Live evaluation execute completed",
      expect.objectContaining({
        queue: "live-evaluations",
        task: "execute",
        organizationId: ORGANIZATION_ID,
        projectId,
        evaluationId,
        traceId,
        outcome: "persisted",
        resultKind: "errored",
        scoreId: persistedScore.id,
        issueAssignmentPath: "none",
        sessionId,
        tokens: 0,
        cost: 0,
        duration: expect.any(Number),
      }),
    )
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
