import {
  buildLiveEvaluationExecuteScopeDedupeKey,
  buildLiveEvaluationExecuteTraceDedupeKey,
  defaultEvaluationTrigger,
  EVALUATION_CONVERSATION_PLACEHOLDER,
  EvaluationIssueRepository,
  EvaluationRepository,
  type EvaluationTurn,
  emptyEvaluationAlignment,
  estimateEvaluationScriptCostMicrocents,
  evaluationSchema,
  type RunLiveEvaluationInput,
  type RunLiveEvaluationResult,
  toLiveEvaluationDebounceMs,
  wrapPromptAsEvaluationScript,
} from "@domain/evaluations"
import { createIssueCentroid } from "@domain/issues"
import { type PublishOptions, type QueueName, QueuePublishError, type QueuePublisherShape } from "@domain/queue"
import { type EvaluationScore, evaluationScoreSchema, writeScoreUseCase } from "@domain/scores"
import { EvaluationId, IssueId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { TRACE_END_DEBOUNCE_MS, TraceRepository } from "@domain/spans"
import type { RedisClient } from "@platform/cache-redis"
import { queryClickhouse } from "@platform/db-clickhouse"
import { evaluations } from "@platform/db-postgres/schema/evaluations"
import { issues } from "@platform/db-postgres/schema/issues"
import { scores } from "@platform/db-postgres/schema/scores"
import { createEventsPublisher } from "@platform/queue-bullmq"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"
import { createDomainEventsWorker } from "./domain-events.ts"
import { createLiveEvaluationsWorker } from "./live-evaluations.ts"
import { createLiveTracesWorker } from "./live-traces.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const ORGANIZATION_ID = "o".repeat(24)
const API_KEY_ID = "k".repeat(24)
const TIMESTAMP = new Date("2026-04-12T12:00:00.000Z")
const DUMMY_REDIS_CLIENT = {} as RedisClient

const VALID_SCRIPT = wrapPromptAsEvaluationScript(
  ["Review the conversation for the linked issue.", "", EVALUATION_CONVERSATION_PLACEHOLDER].join("\n"),
)

const fill = (character: string, length: number) => character.repeat(length)

const toClickHouseTimestamp = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "000")

const toMessageJson = (role: "user" | "assistant", content: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content }] }])

const toSystemJson = (content: string) => JSON.stringify([{ type: "text", content }])

const toHex = (value: string) =>
  [...value]
    .map((character) => (character.charCodeAt(0) % 16).toString(16))
    .join("")
    .padEnd(32, "0")

const makeIssueUuid = (id: string) => {
  const hex = toHex(id)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4111-8111-${hex.slice(12, 24)}`
}

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
  name: "chat gpt-5.4",
  service_name: "phase-13-worker-test",
  kind: 1,
  status_code: 1,
  status_message: "",
  error_type: "",
  tags: input.tags ?? ["lifecycle"],
  metadata: {
    environment: "test",
    story: "live-monitoring-pipeline",
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
  response_id: `seed-${input.spanId}`,
  finish_reasons: ["stop"],
  input_messages: toMessageJson("user", "Please summarize the deployment checklist."),
  output_messages: toMessageJson("assistant", "Run migrations, deploy, and verify."),
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
  resource_string: { "service.name": "phase-13-worker-test" },
  scope_name: "openai-instrumentation",
  scope_version: "1.0.0",
})

const makeEvaluationRow = (input: {
  readonly id: string
  readonly projectId: string
  readonly issueId: string
  readonly filter?: Record<string, unknown>
  readonly sampling?: number
  readonly turn?: EvaluationTurn
  readonly debounce?: number
  readonly script?: string
  readonly archivedAt?: Date | null
  readonly deletedAt?: Date | null
}) =>
  evaluationSchema.parse({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    projectId: input.projectId,
    issueId: input.issueId,
    name: `evaluation-${input.id.slice(0, 6)}`,
    description: "Worker integration live evaluation",
    script: input.script ?? VALID_SCRIPT,
    trigger: {
      ...defaultEvaluationTrigger(),
      filter: input.filter ?? {},
      sampling: input.sampling ?? 100,
      turn: input.turn ?? "every",
      debounce: input.debounce ?? 0,
    },
    alignment: emptyEvaluationAlignment("worker-test-hash"),
    alignedAt: TIMESTAMP,
    archivedAt: input.archivedAt ?? null,
    deletedAt: input.deletedAt ?? null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  })

const makeIssueRow = (input: { readonly id: string; readonly projectId: string }) => ({
  id: input.id,
  uuid: makeIssueUuid(input.id),
  organizationId: ORGANIZATION_ID,
  projectId: input.projectId,
  name: `Issue ${input.id.slice(0, 6)}`,
  description: "Worker integration issue context",
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
    value: 1,
    passed: true,
    feedback: "existing score",
    metadata: { evaluationHash: "worker-test-hash" },
    error: null,
    errored: false,
    duration: 1_000_000,
    tokens: 50,
    cost: 100,
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

interface PublishedMessage {
  readonly queue: QueueName
  readonly task: string
  readonly payload: unknown
  readonly options?: PublishOptions
}

const createPipelineQueueHarness = (consumer: TestQueueConsumer) => {
  const published: PublishedMessage[] = []
  const pendingDelayed = new Map<string, PublishedMessage>()
  const autoDispatchQueues = new Set<QueueName>(["domain-events", "live-evaluations"])

  const publisher: QueuePublisherShape = {
    publish: (queue, task, payload, options) =>
      Effect.tryPromise({
        try: async () => {
          const message =
            options === undefined
              ? ({ queue, task: String(task), payload } satisfies PublishedMessage)
              : ({ queue, task: String(task), payload, options } satisfies PublishedMessage)

          published.push(message)

          if (options?.debounceMs !== undefined) {
            const key = options.dedupeKey
              ? `${queue}:${options.dedupeKey}`
              : `${queue}:${String(task)}:${published.length.toString()}`
            pendingDelayed.set(key, message)
            return
          }

          if (autoDispatchQueues.has(queue)) {
            await consumer.dispatchTask(queue, String(task), payload)
          }
        },
        catch: (cause: unknown) => new QueuePublishError({ cause, queue }),
      }),
    close: () => Effect.void,
  }

  return {
    publisher,
    published,
    getPendingDelayed: (queue?: QueueName) =>
      [...pendingDelayed.values()].filter((message) => (queue ? message.queue === queue : true)),
    flushDelayed: async (queue?: QueueName) => {
      const messages = [...pendingDelayed.entries()].filter(([, message]) => (queue ? message.queue === queue : true))

      for (const [key, message] of messages) {
        pendingDelayed.delete(key)
        await consumer.dispatchTask(message.queue, message.task, message.payload)
      }
    },
  }
}

const createPersistedRunLiveEvaluation = (input: {
  readonly passed: boolean
  readonly feedback: string
  readonly tokens: number
  readonly duration: number
  readonly cost: number
}) => {
  type RunLiveEvaluationFn = NonNullable<Parameters<typeof createLiveEvaluationsWorker>[0]["runLiveEvaluation"]>

  const runLiveEvaluation: NonNullable<Parameters<typeof createLiveEvaluationsWorker>[0]["runLiveEvaluation"]> = (
    runInput: RunLiveEvaluationInput,
  ) =>
    Effect.gen(function* () {
      const evaluationRepository = yield* EvaluationRepository
      const issueRepository = yield* EvaluationIssueRepository
      const traceRepository = yield* TraceRepository
      const evaluation = yield* evaluationRepository.findById(EvaluationId(runInput.evaluationId))
      const traceDetail = yield* traceRepository.findByTraceId({
        organizationId: OrganizationId(runInput.organizationId),
        projectId: ProjectId(runInput.projectId),
        traceId: TraceId(runInput.traceId),
      })
      const issue = yield* issueRepository.findById(IssueId(evaluation.issueId))
      const score = yield* writeScoreUseCase({
        projectId: runInput.projectId,
        source: "evaluation",
        sourceId: evaluation.id,
        sessionId: traceDetail.sessionId ?? null,
        traceId: traceDetail.traceId,
        spanId: traceDetail.rootSpanId,
        simulationId: traceDetail.simulationId || null,
        issueId: input.passed ? null : evaluation.issueId,
        value: input.passed ? 1 : 0,
        passed: input.passed,
        feedback: input.feedback,
        metadata: {
          evaluationHash: evaluation.alignment.evaluationHash,
        },
        error: null,
        duration: input.duration,
        tokens: input.tokens,
        cost: input.cost,
      })
      const evaluationScore = score as EvaluationScore

      return {
        action: "persisted",
        summary: {
          evaluationId: evaluation.id,
          issueId: evaluation.issueId,
          traceId: traceDetail.traceId,
          sessionId: traceDetail.sessionId ?? null,
          scoreId: score.id,
        },
        context: {
          evaluation,
          traceDetail,
          issue: {
            name: issue.name,
            description: issue.description,
          },
          execution: {
            kind: "completed",
            result: {
              passed: input.passed,
              value: input.passed ? 1 : 0,
              feedback: input.feedback,
            },
            duration: input.duration,
            tokens: input.tokens,
            cost: input.cost,
          },
          score: evaluationScore,
        },
      } satisfies RunLiveEvaluationResult
    }) as ReturnType<RunLiveEvaluationFn>

  return runLiveEvaluation
}

const setupPipeline = (options?: {
  readonly runLiveEvaluation?: Parameters<typeof createLiveEvaluationsWorker>[0]["runLiveEvaluation"]
}) => {
  const consumer = new TestQueueConsumer()
  const logger = createMockLogger()
  const harness = createPipelineQueueHarness(consumer)
  const eventsPublisher = createEventsPublisher(harness.publisher)

  createDomainEventsWorker({ consumer, publisher: harness.publisher })
  createLiveTracesWorker({ consumer, eventsPublisher })
  createLiveEvaluationsWorker({
    consumer,
    publisher: harness.publisher,
    postgresClient: pg.appPostgresClient,
    clickhouseClient: ch.client,
    redisClient: DUMMY_REDIS_CLIENT,
    logger,
    ...(options?.runLiveEvaluation ? { runLiveEvaluation: options.runLiveEvaluation } : {}),
  })

  return { eventsPublisher, harness, logger }
}

const publishSpanIngested = async (
  eventsPublisher: ReturnType<typeof createEventsPublisher>,
  input: {
    readonly projectId: string
    readonly traceId: string
  },
) => {
  await Effect.runPromise(
    eventsPublisher.publish({
      name: "SpanIngested",
      organizationId: ORGANIZATION_ID,
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId: input.projectId,
        traceId: input.traceId,
      },
    }),
  )
}

describe("live monitoring pipeline activation", () => {
  it("debounces repeated SpanIngested events and runs the full TraceEnded pipeline through execute persistence", async () => {
    const projectId = fill("a", 24)
    const traceId = fill("b", 32)
    const spanId = fill("c", 16)
    const evaluationId = fill("d", 24)
    const issueId = fill("e", 24)
    const sessionId = "session-pr4-pipeline"
    const aiDuration = 321_000_000
    const aiTokens = 90
    const aiTokenUsage = {
      input: 30,
      output: aiTokens - 30,
    } as const
    const expectedCost = estimateEvaluationScriptCostMicrocents({
      tokens: aiTokens,
      tokenUsage: aiTokenUsage,
    })

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        spanId,
        sessionId,
      }),
    ])
    await insertIssues([
      makeIssueRow({
        id: issueId,
        projectId,
      }),
    ])
    await insertEvaluations([
      makeEvaluationRow({
        id: evaluationId,
        projectId,
        issueId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
      }),
    ])

    const { eventsPublisher, harness, logger } = setupPipeline({
      runLiveEvaluation: createPersistedRunLiveEvaluation({
        passed: false,
        feedback: "The conversation exhibits the linked issue.",
        tokens: aiTokens,
        duration: aiDuration,
        cost: expectedCost,
      }),
    })

    await publishSpanIngested(eventsPublisher, { projectId, traceId })
    await publishSpanIngested(eventsPublisher, { projectId, traceId })

    expect(
      harness.published.filter((message) => message.queue === "live-traces" && message.task === "end"),
    ).toHaveLength(2)
    expect(harness.getPendingDelayed("live-traces")).toEqual([
      {
        queue: "live-traces",
        task: "end",
        payload: {
          organizationId: ORGANIZATION_ID,
          projectId,
          traceId,
        },
        options: {
          dedupeKey: `live-traces:end:${ORGANIZATION_ID}:${projectId}:${traceId}`,
          debounceMs: TRACE_END_DEBOUNCE_MS,
        },
      },
    ])

    await harness.flushDelayed("live-traces")

    const traceEndedDispatches = harness.published.filter(
      (message) =>
        message.queue === "domain-events" &&
        message.task === "dispatch" &&
        typeof message.payload === "object" &&
        message.payload !== null &&
        "event" in message.payload &&
        typeof message.payload.event === "object" &&
        message.payload.event !== null &&
        "name" in message.payload.event &&
        message.payload.event.name === "TraceEnded",
    )
    const enqueuePublishes = harness.published.filter(
      (message) => message.queue === "live-evaluations" && message.task === "enqueue",
    )
    const executePublishes = harness.published.filter(
      (message) => message.queue === "live-evaluations" && message.task === "execute",
    )

    expect(traceEndedDispatches).toHaveLength(1)
    expect(enqueuePublishes).toHaveLength(1)
    expect(harness.published).toContainEqual({
      queue: "live-evaluations",
      task: "enqueue",
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId,
        traceId,
      },
      options: {
        dedupeKey: `evaluations:live:enqueue:${ORGANIZATION_ID}:${projectId}:${traceId}`,
      },
    })
    expect(harness.published).toContainEqual({
      queue: "live-annotation-queues",
      task: "curate",
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId,
        traceId,
      },
      options: {
        dedupeKey: `annotation-queues:live:curate:${ORGANIZATION_ID}:${projectId}:${traceId}`,
      },
    })
    expect(harness.published).toContainEqual({
      queue: "system-annotation-queues",
      task: "fanOut",
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId,
        traceId,
      },
      options: {
        dedupeKey: `annotation-queues:system:fan-out:${ORGANIZATION_ID}:${projectId}:${traceId}`,
      },
    })
    expect(executePublishes).toEqual([
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
        },
      },
    ])

    const persistedScores = (await pg.db.select().from(scores)).filter(
      (score) => score.projectId === projectId && score.sourceId === evaluationId && score.traceId === traceId,
    )

    expect(persistedScores).toHaveLength(1)
    const [persistedScore] = persistedScores
    if (!persistedScore) throw new Error("Expected a persisted live monitoring score")

    expect(persistedScore).toMatchObject({
      organizationId: ORGANIZATION_ID,
      projectId,
      sessionId,
      traceId,
      source: "evaluation",
      sourceId: evaluationId,
      issueId,
      value: 0,
      passed: false,
      errored: false,
      feedback: "The conversation exhibits the linked issue.",
      error: null,
      duration: aiDuration,
      tokens: aiTokens,
      cost: expectedCost,
    })
    expect(await queryAnalyticsScores(ORGANIZATION_ID, persistedScore.id)).toEqual([{ id: persistedScore.id }])

    const executeCompletedCall = logger.info.mock.calls.find((call) => call[0] === "Live evaluation execute completed")
    expect(executeCompletedCall?.[1]).toMatchObject({
      queue: "live-evaluations",
      task: "execute",
      organizationId: ORGANIZATION_ID,
      projectId,
      evaluationId,
      traceId,
      outcome: "persisted",
      resultKind: "failed",
      scoreId: persistedScore.id,
      issueAssignmentPath: "direct",
      sessionId,
      tokens: aiTokens,
      cost: expectedCost,
      duration: aiDuration,
    })
  })

  it("applies turn selection while skipping paused, archived, and deleted evaluations after TraceEnded fan-out", async () => {
    const projectId = fill("f", 24)
    const traceId = fill("g", 32)
    const priorTraceId = fill("h", 32)
    const spanId = fill("i", 16)
    const sessionId = "session-pr4-selection"
    const issueId = fill("j", 24)
    const everyEvaluationId = fill("k", 24)
    const firstEvaluationId = fill("l", 24)
    const lastEvaluationId = fill("m", 24)
    const pausedEvaluationId = fill("n", 24)
    const archivedEvaluationId = fill("p", 24)
    const deletedEvaluationId = fill("q", 24)
    const lastDebounceSeconds = 30

    await insertTraceRows([
      makeTraceRow({
        projectId,
        traceId,
        spanId,
        sessionId,
      }),
    ])
    await insertIssues([
      makeIssueRow({
        id: issueId,
        projectId,
      }),
    ])
    await insertEvaluations([
      makeEvaluationRow({
        id: everyEvaluationId,
        projectId,
        issueId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "every",
      }),
      makeEvaluationRow({
        id: firstEvaluationId,
        projectId,
        issueId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "first",
      }),
      makeEvaluationRow({
        id: lastEvaluationId,
        projectId,
        issueId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        turn: "last",
        debounce: lastDebounceSeconds,
      }),
      makeEvaluationRow({
        id: pausedEvaluationId,
        projectId,
        issueId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        sampling: 0,
      }),
      makeEvaluationRow({
        id: archivedEvaluationId,
        projectId,
        issueId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        archivedAt: TIMESTAMP,
      }),
      makeEvaluationRow({
        id: deletedEvaluationId,
        projectId,
        issueId,
        filter: { tags: [{ op: "in", value: ["lifecycle"] }] },
        deletedAt: TIMESTAMP,
      }),
    ])
    await insertScores([
      makeScoreRow({
        id: fill("r", 24),
        projectId,
        evaluationId: firstEvaluationId,
        traceId: priorTraceId,
        sessionId,
      }),
    ])

    const { eventsPublisher, harness, logger } = setupPipeline({
      runLiveEvaluation: (input) =>
        Effect.succeed({
          action: "skipped" as const,
          reason: "result-already-exists" as const,
          evaluationId: input.evaluationId,
          traceId: input.traceId,
        }),
    })

    await publishSpanIngested(eventsPublisher, { projectId, traceId })
    await harness.flushDelayed("live-traces")

    const executePublishes = harness.published.filter(
      (message) => message.queue === "live-evaluations" && message.task === "execute",
    )
    const pendingExecutePublishes = harness.getPendingDelayed("live-evaluations")

    expect(executePublishes).toContainEqual({
      queue: "live-evaluations",
      task: "execute",
      payload: {
        organizationId: ORGANIZATION_ID,
        projectId,
        evaluationId: everyEvaluationId,
        traceId,
      },
      options: {
        dedupeKey: buildLiveEvaluationExecuteTraceDedupeKey({
          organizationId: ORGANIZATION_ID,
          projectId,
          evaluationId: everyEvaluationId,
          traceId,
        }),
      },
    })
    expect(pendingExecutePublishes).toEqual([
      {
        queue: "live-evaluations",
        task: "execute",
        payload: {
          organizationId: ORGANIZATION_ID,
          projectId,
          evaluationId: lastEvaluationId,
          traceId,
        },
        options: {
          dedupeKey: buildLiveEvaluationExecuteScopeDedupeKey({
            organizationId: ORGANIZATION_ID,
            projectId,
            evaluationId: lastEvaluationId,
            traceId,
            sessionId,
          }),
          debounceMs: toLiveEvaluationDebounceMs(lastDebounceSeconds),
        },
      },
    ])
    expect(
      executePublishes.some((message) => {
        const payload = message.payload as { evaluationId?: string }
        return payload.evaluationId === firstEvaluationId
      }),
    ).toBe(false)
    expect(
      executePublishes.some((message) => {
        const payload = message.payload as { evaluationId?: string }
        return payload.evaluationId === pausedEvaluationId
      }),
    ).toBe(false)
    expect(
      executePublishes.some((message) => {
        const payload = message.payload as { evaluationId?: string }
        return payload.evaluationId === archivedEvaluationId
      }),
    ).toBe(false)
    expect(
      executePublishes.some((message) => {
        const payload = message.payload as { evaluationId?: string }
        return payload.evaluationId === deletedEvaluationId
      }),
    ).toBe(false)

    const enqueueCompletedCall = logger.info.mock.calls.find((call) => call[0] === "Live evaluation enqueue completed")
    expect(enqueueCompletedCall?.[1]).toMatchObject({
      queue: "live-evaluations",
      task: "enqueue",
      organizationId: ORGANIZATION_ID,
      projectId,
      traceId,
      outcome: "completed",
      sessionId,
      activeEvaluationsScanned: 4,
      filterMatchedCount: 3,
      skippedPausedCount: 1,
      skippedSamplingCount: 0,
      skippedTurnCount: 1,
      publishedExecuteCount: 2,
    })
  })
})
