import type { AI } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import {
  BillingOverrideRepository,
  BillingSpendReservation,
  BillingUsageEventRepository,
  BillingUsagePeriodRepository,
  StripeSubscriptionLookup,
} from "@domain/billing"
import {
  createFakeBillingOverrideRepository,
  createFakeBillingSpendReservation,
  createFakeBillingUsageEventRepository,
  createFakeBillingUsagePeriodRepository,
  createFakeStripeSubscriptionLookup,
  seedBillingUsagePeriod,
} from "@domain/billing/testing"
import { OutboxEventWriter, type OutboxEventWriterShape } from "@domain/events"
import { QueuePublisher, type QueuePublisherShape } from "@domain/queue"
import { type DetectorHealthTracker, type ScriptRuntime, ScriptRuntimeError } from "@domain/sandbox"
import { createFakeDetectorHealthTracker, createFakeScriptRuntime } from "@domain/sandbox/testing"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  CacheError,
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SessionId,
  SettingsReader,
  SignalId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import {
  MessageEmbeddingRepository,
  SessionRepository,
  SpanRepository,
  type TraceDetail,
  TraceRepository,
  TraceSearchRepository,
} from "@domain/spans"
import {
  createFakeMessageEmbeddingRepository,
  createFakeSessionRepository,
  createFakeSpanRepository,
  createFakeTraceRepository,
  createFakeTraceSearchRepository,
} from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  wrapPromptAsEvaluationScript,
} from "../../codegen/judge-script-template.ts"
import {
  defaultEvaluationTrigger,
  type Evaluation,
  emptyEvaluationAlignment,
  evaluationSchema,
} from "../../entities/evaluation.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../../ports/evaluation-repository.ts"
import { type EvaluationSignal, EvaluationSignalRepository } from "../../ports/evaluation-signal-repository.ts"
import { estimateEvaluationScriptCostMicrocents } from "../../runtime/evaluation-execution.ts"
import { runLiveEvaluationUseCase } from "./run-live-evaluation.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  evaluationId: "c".repeat(24),
  traceId: "d".repeat(32),
} as const

const VALID_SCRIPT = wrapPromptAsEvaluationScript(
  [
    "Review the conversation for the linked issue.",
    "",
    "Conversation:",
    EVALUATION_CONVERSATION_PLACEHOLDER,
    "",
    "Set passed to true when the issue is absent.",
  ].join("\n"),
)

function makeTraceDetail(
  overrides?: Partial<Pick<TraceDetail, "projectId" | "traceId" | "sessionId" | "allMessages">>,
): TraceDetail {
  return {
    organizationId: OrganizationId(INPUT.organizationId),
    projectId: overrides?.projectId ?? ProjectId(INPUT.projectId),
    traceId: overrides?.traceId ?? TraceId(INPUT.traceId),
    spanCount: 3,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 1,
    timeToFirstTokenNs: 0,
    tokensInput: 120,
    tokensOutput: 80,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 200,
    costInputMicrocents: 50,
    costOutputMicrocents: 25,
    costTotalMicrocents: 75,
    sessionId: overrides?.sessionId ?? SessionId("session"),
    userId: ExternalUserId("user"),
    userEmail: "",
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: ["gpt-4o-mini"],
    providers: ["openai"],
    serviceNames: ["web"],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: [{ type: "text", text: "You are a careful assistant." }],
    inputMessages: [],
    outputMessages: [],
    allMessages: overrides?.allMessages ?? [
      {
        role: "user",
        parts: [{ type: "text", content: "Please summarize the deployment checklist." }],
      },
      {
        role: "assistant",
        parts: [{ type: "text", content: "Verify migrations, rollback steps, and dashboards after deploy." }],
      },
    ],
  }
}

function makeEvaluation(
  overrides?: Partial<
    Pick<
      Evaluation,
      "id" | "organizationId" | "projectId" | "signalId" | "script" | "trigger" | "archivedAt" | "deletedAt"
    >
  >,
) {
  return evaluationSchema.parse({
    id: overrides?.id ?? INPUT.evaluationId,
    organizationId: overrides?.organizationId ?? INPUT.organizationId,
    projectId: overrides?.projectId ?? INPUT.projectId,
    signalId: overrides?.signalId ?? "i".repeat(24),
    name: "Live evaluation",
    description: "Detects the linked issue on live traces.",
    script: overrides?.script ?? "const result = true",
    trigger: overrides?.trigger ?? defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash"),
    alignedAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: overrides?.archivedAt ?? null,
    deletedAt: overrides?.deletedAt ?? null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  })
}

function makeSignal(overrides?: Partial<Pick<EvaluationSignal, "id" | "projectId" | "name" | "description">>) {
  return {
    id: overrides?.id ?? SignalId("i".repeat(24)),
    projectId: overrides?.projectId ?? INPUT.projectId,
    name: overrides?.name ?? "Deployment checklist omission",
    description: overrides?.description ?? "The assistant fails to mention key deployment steps.",
  } satisfies EvaluationSignal
}

function createEvaluationRepository(findById: EvaluationRepositoryShape["findById"]): EvaluationRepositoryShape {
  return {
    findById,
    save: () => Effect.die("Unexpected call to save"),
    listByProjectId: () => Effect.die("Unexpected call to listByProjectId"),
    listBySignalId: () => Effect.die("Unexpected call to listBySignalId"),
    listBySignalIds: () => Effect.die("Unexpected call to listBySignalIds"),
    archive: () => Effect.die("Unexpected call to archive"),
    unarchive: () => Effect.die("Unexpected call to unarchive"),
    softDelete: () => Effect.die("Unexpected call to softDelete"),
    softDeleteBySignalId: () => Effect.die("Unexpected call to softDeleteBySignalId"),
  }
}

function createSignalRepository(
  findById: (id: ReturnType<typeof SignalId>) => Effect.Effect<EvaluationSignal, NotFoundError>,
) {
  return {
    findById,
  }
}

const createNoopPublisher = (overrides?: Partial<QueuePublisherShape>): QueuePublisherShape => ({
  publish: () => Effect.void,
  scheduleRepeatable: () => Effect.void,
  close: () => Effect.void,
  ...overrides,
})

function createScoreWriteLayer(input?: {
  readonly scoreRepository?: ReturnType<typeof createFakeScoreRepository>["repository"] | undefined
  readonly scoreAnalyticsRepository?: ReturnType<typeof createFakeScoreAnalyticsRepository>["repository"] | undefined
  readonly outboxEventWriter?: OutboxEventWriterShape | undefined
}): Layer.Layer<ScoreAnalyticsRepository | ScoreRepository | OutboxEventWriter | SqlClient, never, never> {
  return Layer.mergeAll(
    Layer.succeed(ScoreRepository, input?.scoreRepository ?? createFakeScoreRepository().repository),
    Layer.succeed(
      ScoreAnalyticsRepository,
      input?.scoreAnalyticsRepository ?? createFakeScoreAnalyticsRepository().repository,
    ),
    Layer.succeed(OutboxEventWriter, input?.outboxEventWriter ?? { write: () => Effect.void }),
    Layer.succeed(
      SqlClient,
      createFakeSqlClient({
        organizationId: OrganizationId(INPUT.organizationId),
      }),
    ),
  )
}

function createBillingLayer(input?: {
  readonly billingOverrideRepository?: ReturnType<typeof createFakeBillingOverrideRepository>["repository"] | undefined
  readonly billingUsageEventRepository?:
    | ReturnType<typeof createFakeBillingUsageEventRepository>["repository"]
    | undefined
  readonly billingUsagePeriodRepository?:
    | ReturnType<typeof createFakeBillingUsagePeriodRepository>["repository"]
    | undefined
  readonly stripeSubscriptionLookup?: ReturnType<typeof createFakeStripeSubscriptionLookup>["service"] | undefined
  readonly reservation?: ReturnType<typeof createFakeBillingSpendReservation>["reservation"] | undefined
  readonly organizationSettings?: { readonly billing?: { readonly spendingLimitCents?: number } } | null
}) {
  const { repository: defaultBillingOverrideRepository } = createFakeBillingOverrideRepository()
  const { repository: defaultBillingUsageEventRepository } = createFakeBillingUsageEventRepository()
  const { repository: defaultBillingUsagePeriodRepository } = createFakeBillingUsagePeriodRepository()
  const { service: defaultStripeSubscriptionLookup } = createFakeStripeSubscriptionLookup()
  const { reservation: defaultReservation } = createFakeBillingSpendReservation()

  return Layer.mergeAll(
    Layer.succeed(BillingOverrideRepository, input?.billingOverrideRepository ?? defaultBillingOverrideRepository),
    Layer.succeed(
      BillingUsageEventRepository,
      input?.billingUsageEventRepository ?? defaultBillingUsageEventRepository,
    ),
    Layer.succeed(
      BillingUsagePeriodRepository,
      input?.billingUsagePeriodRepository ?? defaultBillingUsagePeriodRepository,
    ),
    Layer.succeed(StripeSubscriptionLookup, input?.stripeSubscriptionLookup ?? defaultStripeSubscriptionLookup),
    Layer.succeed(BillingSpendReservation, input?.reservation ?? defaultReservation),
    Layer.succeed(SettingsReader, {
      getOrganizationSettings: () => Effect.succeed(input?.organizationSettings ?? null),
      getProjectSettings: () => Effect.die("Project settings should not be loaded in runLiveEvaluation tests"),
    }),
  )
}

function createUseCaseLayer(input: {
  readonly traceRepository: ReturnType<typeof createFakeTraceRepository>["repository"]
  readonly evaluationRepository: EvaluationRepositoryShape
  readonly scoreRepository?: ReturnType<typeof createFakeScoreRepository>["repository"] | undefined
  readonly scoreWriteLayer?: ReturnType<typeof createScoreWriteLayer> | undefined
  readonly signalRepository?: ReturnType<typeof createSignalRepository> | undefined
  readonly aiLayer?: ReturnType<typeof createFakeAI>["layer"] | undefined
  readonly billingLayer?: ReturnType<typeof createBillingLayer> | undefined
  readonly scriptRuntimeLayer?: ReturnType<typeof createFakeScriptRuntime>["layer"] | undefined
  readonly detectorHealthLayer?: ReturnType<typeof createFakeDetectorHealthTracker>["layer"] | undefined
  readonly traceSearchRepository?: ReturnType<typeof createFakeTraceSearchRepository>["repository"] | undefined
  readonly publisher?: QueuePublisherShape | undefined
}): Layer.Layer<
  | AI
  | BillingOverrideRepository
  | BillingSpendReservation
  | BillingUsageEventRepository
  | BillingUsagePeriodRepository
  | DetectorHealthTracker
  | EvaluationSignalRepository
  | EvaluationRepository
  | MessageEmbeddingRepository
  | OutboxEventWriter
  | QueuePublisher
  | ScoreAnalyticsRepository
  | ScoreRepository
  | ScriptRuntime
  | SessionRepository
  | SettingsReader
  | SpanRepository
  | SqlClient
  | StripeSubscriptionLookup
  | TraceRepository
  | TraceSearchRepository,
  never,
  never
> {
  return Layer.mergeAll(
    Layer.succeed(TraceRepository, input.traceRepository),
    Layer.succeed(SessionRepository, createFakeSessionRepository().repository),
    Layer.succeed(SpanRepository, createFakeSpanRepository().repository),
    Layer.succeed(MessageEmbeddingRepository, createFakeMessageEmbeddingRepository().repository),
    Layer.succeed(TraceSearchRepository, input.traceSearchRepository ?? createFakeTraceSearchRepository().repository),
    Layer.succeed(QueuePublisher, input.publisher ?? createNoopPublisher()),
    Layer.succeed(EvaluationRepository, input.evaluationRepository),
    input.scoreWriteLayer ?? createScoreWriteLayer({ scoreRepository: input.scoreRepository }),
    Layer.succeed(
      EvaluationSignalRepository,
      input.signalRepository ??
        createSignalRepository(() => Effect.die("Signal should not be loaded in this scenario")),
    ),
    input.aiLayer ?? createFakeAI().layer,
    input.billingLayer ?? createBillingLayer(),
    input.scriptRuntimeLayer ?? createFakeScriptRuntime().layer,
    input.detectorHealthLayer ?? createFakeDetectorHealthTracker().layer,
  )
}

function createTrackedScoreWriteFixture() {
  const operations: string[] = []
  const outboxEvents: unknown[] = []

  const scoreFixture = createFakeScoreRepository()
  const { scores: persistedScores } = scoreFixture
  const scoreRepository = {
    ...scoreFixture.repository,
    save: (score: Parameters<typeof scoreFixture.repository.save>[0]) =>
      Effect.sync(() => {
        operations.push("score-save")
        persistedScores.set(score.id, score)
      }),
  }

  const analyticsFixture = createFakeScoreAnalyticsRepository()
  const { inserted } = analyticsFixture
  const scoreAnalyticsRepository = {
    ...analyticsFixture.repository,
    existsById: (id: Parameters<typeof analyticsFixture.repository.existsById>[0]) =>
      Effect.sync(() => {
        operations.push("analytics-exists")
        return inserted.includes(id)
      }),
    insert: (score: Parameters<typeof analyticsFixture.repository.insert>[0]) =>
      Effect.sync(() => {
        operations.push("analytics-insert")
        inserted.push(score.id)
      }),
  }

  const scoreWriteLayer = createScoreWriteLayer({
    scoreRepository,
    scoreAnalyticsRepository,
    outboxEventWriter: {
      write: (event: Parameters<OutboxEventWriterShape["write"]>[0]) =>
        Effect.sync(() => {
          operations.push(event.eventName === "ScoreCreated" ? "score-outbox-write" : "billing-outbox-write")
          outboxEvents.push(event)
        }),
    },
  })

  return {
    operations,
    persistedScores,
    inserted,
    outboxEvents,
    scoreWriteLayer,
  }
}

function expectImmutableAnalyticsSyncOrder(operations: readonly string[]) {
  const scoreSaveIndex = operations.indexOf("score-save")
  const outboxWriteIndex = operations.indexOf("score-outbox-write")
  const analyticsExistsIndex = operations.indexOf("analytics-exists")
  const analyticsInsertIndex = operations.indexOf("analytics-insert")

  expect(scoreSaveIndex).toBeGreaterThanOrEqual(0)
  expect(outboxWriteIndex).toBeGreaterThan(scoreSaveIndex)
  expect(analyticsExistsIndex).toBeGreaterThan(outboxWriteIndex)
  expect(analyticsInsertIndex).toBeGreaterThan(analyticsExistsIndex)
}

describe("runLiveEvaluationUseCase", () => {
  it("skips when the evaluation no longer exists", async () => {
    let traceLoadCalls = 0
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => {
        traceLoadCalls += 1
        return Effect.die("Trace should not be loaded when evaluation is missing")
      },
    })
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.fail(new NotFoundError({ entity: "Evaluation", id: INPUT.evaluationId })),
    )

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "evaluation-not-found",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(traceLoadCalls).toBe(0)
  })

  it("skips when the evaluation does not belong to the requested project", async () => {
    let traceLoadCalls = 0
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => {
        traceLoadCalls += 1
        return Effect.die("Trace should not be loaded for a project-mismatched evaluation")
      },
    })
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed(
        makeEvaluation({
          projectId: "p".repeat(24),
        }),
      ),
    )

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "evaluation-not-found",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(traceLoadCalls).toBe(0)
  })

  it("skips paused evaluations before loading trace context", async () => {
    let traceLoadCalls = 0
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => {
        traceLoadCalls += 1
        return Effect.die("Trace should not be loaded for a paused evaluation")
      },
    })
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed(
        makeEvaluation({
          trigger: {
            ...defaultEvaluationTrigger(),
            sampling: 0,
          },
        }),
      ),
    )

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "paused",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(traceLoadCalls).toBe(0)
  })

  it("skips archived evaluations before loading trace context", async () => {
    let traceLoadCalls = 0
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => {
        traceLoadCalls += 1
        return Effect.die("Trace should not be loaded for an archived evaluation")
      },
    })
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed(
        makeEvaluation({
          archivedAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
      ),
    )

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "archived",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(traceLoadCalls).toBe(0)
  })

  it("skips deleted evaluations before loading trace context", async () => {
    let traceLoadCalls = 0
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => {
        traceLoadCalls += 1
        return Effect.die("Trace should not be loaded for a deleted evaluation")
      },
    })
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed(
        makeEvaluation({
          deletedAt: new Date("2026-04-03T00:00:00.000Z"),
        }),
      ),
    )

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "deleted",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(traceLoadCalls).toBe(0)
  })

  it("skips when a canonical result already exists for the evaluation and trace", async () => {
    let traceLoadCalls = 0
    let duplicateCheckCalls = 0
    let signalLoadCalls = 0
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => {
        traceLoadCalls += 1
        return Effect.die("Trace should not be loaded when a canonical result already exists")
      },
    })
    const evaluation = makeEvaluation()
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() => {
      signalLoadCalls += 1
      return Effect.die("Signal should not be loaded when a canonical result already exists")
    })
    const operations: string[] = []
    const duplicateFixture = createFakeScoreRepository({
      existsByEvaluationIdAndTraceId: ({ projectId, evaluationId, traceId }) => {
        duplicateCheckCalls += 1
        expect(projectId).toEqual(ProjectId(INPUT.projectId))
        expect(evaluationId).toBe(evaluation.id)
        expect(traceId).toEqual(TraceId(INPUT.traceId))
        return Effect.succeed(true)
      },
    })
    const scoreRepository = {
      ...duplicateFixture.repository,
      save: (score: Parameters<typeof duplicateFixture.repository.save>[0]) =>
        Effect.sync(() => {
          operations.push("score-save")
          duplicateFixture.scores.set(score.id, score)
        }),
    }
    const analyticsFixture = createFakeScoreAnalyticsRepository()
    const scoreAnalyticsRepository = {
      ...analyticsFixture.repository,
      existsById: (id: Parameters<typeof analyticsFixture.repository.existsById>[0]) =>
        Effect.sync(() => {
          operations.push("analytics-exists")
          return analyticsFixture.inserted.includes(id)
        }),
      insert: (score: Parameters<typeof analyticsFixture.repository.insert>[0]) =>
        Effect.sync(() => {
          operations.push("analytics-insert")
          analyticsFixture.inserted.push(score.id)
        }),
    }
    const { calls, layer: aiLayer } = createFakeAI()
    const scoreWriteLayer = createScoreWriteLayer({
      scoreRepository,
      scoreAnalyticsRepository,
      outboxEventWriter: {
        write: (event) =>
          Effect.sync(() => {
            operations.push(event.eventName === "ScoreCreated" ? "score-outbox-write" : "billing-outbox-write")
          }),
      },
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreWriteLayer,
            signalRepository,
            aiLayer,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "result-already-exists",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(duplicateCheckCalls).toBe(1)
    expect(traceLoadCalls).toBe(0)
    expect(signalLoadCalls).toBe(0)
    expect(calls.generate).toHaveLength(0)
    expect(operations).toEqual([])
  })

  it("skips when another worker wins the canonical write race after execution", async () => {
    let duplicateCheckCalls = 0
    let duplicateCommitted = false
    const evaluation = makeEvaluation({
      script: VALID_SCRIPT,
    })
    const issue = makeSignal({
      id: SignalId(evaluation.signalId),
    })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository((signalId) => {
      expect(signalId).toEqual(SignalId(evaluation.signalId))
      return Effect.succeed(issue)
    })
    const operations: string[] = []
    const duplicateFixture = createFakeScoreRepository({
      existsByEvaluationIdAndTraceId: ({ projectId, evaluationId, traceId }) => {
        duplicateCheckCalls += 1
        expect(projectId).toEqual(ProjectId(INPUT.projectId))
        expect(evaluationId).toBe(evaluation.id)
        expect(traceId).toEqual(TraceId(INPUT.traceId))
        return Effect.succeed(duplicateCommitted)
      },
    })
    const scoreRepository = {
      ...duplicateFixture.repository,
      save: () =>
        Effect.sync(() => {
          operations.push("score-save")
          duplicateCommitted = true
        }).pipe(
          Effect.flatMap(() =>
            Effect.fail(
              new RepositoryError({
                operation: "save",
                cause: {
                  code: "23505",
                  constraint: "scores_canonical_evaluation_trace_idx",
                },
              }),
            ),
          ),
        ),
    }
    const analyticsFixture = createFakeScoreAnalyticsRepository()
    const scoreAnalyticsRepository = {
      ...analyticsFixture.repository,
      existsById: () =>
        Effect.sync(() => {
          operations.push("analytics-exists")
          return false
        }),
      insert: () =>
        Effect.sync(() => {
          operations.push("analytics-insert")
        }),
    }
    const outboxEvents: unknown[] = []
    const scoreWriteLayer = createScoreWriteLayer({
      scoreRepository,
      scoreAnalyticsRepository,
      outboxEventWriter: {
        write: (event: Parameters<OutboxEventWriterShape["write"]>[0]) =>
          Effect.sync(() => {
            operations.push(event.eventName === "ScoreCreated" ? "score-outbox-write" : "billing-outbox-write")
            outboxEvents.push(event)
          }),
      },
    })
    const { layer: aiLayer } = createFakeAI()
    const scriptRuntime = createFakeScriptRuntime({
      run: () =>
        Effect.succeed({
          value: 1,
          feedback: "The conversation does not exhibit the linked issue.",
          duration: 456_000_000,
          tokens: 120,
          cost: 0,
        }),
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreWriteLayer,
            signalRepository,
            aiLayer,
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "result-already-exists",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(duplicateCheckCalls).toBe(2)
    expect(scriptRuntime.calls.run).toHaveLength(1)
    expect(outboxEvents.map((event) => (event as { eventName: string }).eventName)).toEqual([
      "BillingUsagePeriodUpdated",
    ])
    expect(operations).toEqual(["billing-outbox-write", "score-save"])
  })

  it("skips when the trace no longer exists", async () => {
    const { repository: traceRepository } = createFakeTraceRepository()
    const evaluation = makeEvaluation()
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "trace-not-found",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
  })

  it("skips when the linked issue no longer exists", async () => {
    const evaluation = makeEvaluation()
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() =>
      Effect.fail(new NotFoundError({ entity: "Signal", id: evaluation.signalId })),
    )

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "issue-not-found",
      evaluationId: evaluation.id,
      traceId: traceDetail.traceId,
    })
  })

  it("skips before AI execution when billing blocks the live evaluation", async () => {
    const evaluation = makeEvaluation({ script: VALID_SCRIPT })
    const issue = makeSignal({ id: SignalId(evaluation.signalId) })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() => Effect.succeed(issue))
    const { repository: billingUsagePeriodRepository } = createFakeBillingUsagePeriodRepository()
    const now = new Date()
    const currentPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const currentPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

    await Effect.runPromise(
      billingUsagePeriodRepository
        .upsert(
          seedBillingUsagePeriod({
            organizationId: OrganizationId(INPUT.organizationId),
            planSlug: "free",
            periodStart: currentPeriodStart,
            periodEnd: currentPeriodEnd,
            includedCredits: 20_000,
            consumedCredits: 19_980,
          }),
        )
        .pipe(
          Effect.provideService(
            SqlClient,
            createFakeSqlClient({ organizationId: OrganizationId(INPUT.organizationId) }),
          ),
        ),
    )

    const { layer: aiLayer, calls } = createFakeAI()

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
            aiLayer,
            billingLayer: createBillingLayer({ billingUsagePeriodRepository }),
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "billing-blocked",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(calls.generate).toHaveLength(0)
  })

  it("records billing after hosted AI execution completes", async () => {
    const evaluation = makeEvaluation({ script: VALID_SCRIPT })
    const issue = makeSignal({ id: SignalId(evaluation.signalId) })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() => Effect.succeed(issue))
    const operations: string[] = []
    const { layer: aiLayer } = createFakeAI()
    const scriptRuntime = createFakeScriptRuntime({
      run: () =>
        Effect.sync(() => {
          operations.push("script-run")
          return {
            value: 1,
            feedback: "The conversation does not exhibit the linked issue.",
            duration: 1,
            tokens: 12,
            cost: 0,
          }
        }),
    })
    const scoreWriteLayer = createScoreWriteLayer({
      outboxEventWriter: {
        write: (event) =>
          Effect.sync(() => {
            operations.push(event.eventName === "ScoreCreated" ? "score-outbox-write" : "billing-outbox-write")
          }),
      },
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
            aiLayer,
            billingLayer: createBillingLayer(),
            scoreWriteLayer,
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
    expect(operations).toEqual(["script-run", "billing-outbox-write", "score-outbox-write"])
    expect(scriptRuntime.calls.run).toHaveLength(1)
  })

  const EMBEDDING_SCRIPT = "return Passed((await semanticSimilarity('frustration')) >= 0.5 ? 1 : 0)"

  it("defers an embedding-capability evaluation and re-publishes when the session's embeddings are not indexed yet", async () => {
    const evaluation = makeEvaluation({ script: EMBEDDING_SCRIPT })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() =>
      Effect.die("Signal should not be loaded while deferring for embeddings"),
    )
    const scriptRuntime = createFakeScriptRuntime({
      run: () => Effect.die("Script should not run while deferring for embeddings"),
    })
    const published: Array<{ payload: unknown; options: unknown }> = []
    const publisher = createNoopPublisher({
      publish: (_queue, _task, payload, options) =>
        Effect.sync(() => {
          published.push({ payload, options })
        }),
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
            publisher,
            scriptRuntimeLayer: scriptRuntime.layer,
            // Default fake returns no occurrences → embeddings not indexed yet.
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "awaiting-embeddings",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(published).toHaveLength(1)
    expect(published[0]?.payload).toMatchObject({
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
      embeddingWaitAttempt: 1,
    })
    expect(published[0]?.options).toMatchObject({ debounceMs: expect.any(Number) })
    expect(scriptRuntime.calls.run).toHaveLength(0)
  })

  it("defers when occurrences exist but message embeddings are not stored yet", async () => {
    const evaluation = makeEvaluation({ script: EMBEDDING_SCRIPT })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() =>
      Effect.die("Signal should not be loaded while deferring for embeddings"),
    )
    const scriptRuntime = createFakeScriptRuntime({
      run: () => Effect.die("Script should not run while deferring for embeddings"),
    })
    const published: Array<{ payload: unknown; options: unknown }> = []
    const publisher = createNoopPublisher({
      publish: (_queue, _task, payload, options) =>
        Effect.sync(() => {
          published.push({ payload, options })
        }),
    })
    const traceSearchRepository = createFakeTraceSearchRepository({
      listMessageOccurrencesForTraces: () => Effect.succeed([{ contentHash: "hash-a", role: "user" as const }]),
    }).repository

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
            publisher,
            scriptRuntimeLayer: scriptRuntime.layer,
            traceSearchRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "awaiting-embeddings",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(published).toHaveLength(1)
    expect(scriptRuntime.calls.run).toHaveLength(0)
  })

  it("skips without scoring when wait attempts are exhausted but vectors never arrived", async () => {
    const evaluation = makeEvaluation({ script: EMBEDDING_SCRIPT })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() =>
      Effect.die("Signal should not be loaded when vectors never arrived"),
    )
    const scriptRuntime = createFakeScriptRuntime({
      run: () => Effect.die("Script should not run when vectors never arrived"),
    })
    const traceSearchRepository = createFakeTraceSearchRepository({
      listMessageOccurrencesForTraces: () => Effect.succeed([{ contentHash: "hash-a", role: "user" as const }]),
    }).repository
    const { operations, scoreWriteLayer } = createTrackedScoreWriteFixture()

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase({ ...INPUT, embeddingWaitAttempt: 99 }).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
            scoreWriteLayer,
            scriptRuntimeLayer: scriptRuntime.layer,
            traceSearchRepository,
          }),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "awaiting-embeddings",
      evaluationId: INPUT.evaluationId,
      traceId: INPUT.traceId,
    })
    expect(scriptRuntime.calls.run).toHaveLength(0)
    expect(operations).toEqual([])
  })

  it("runs an embedding-capability evaluation anyway once the wait attempts are exhausted", async () => {
    const evaluation = makeEvaluation({ script: EMBEDDING_SCRIPT })
    const issue = makeSignal({ id: SignalId(evaluation.signalId) })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() => Effect.succeed(issue))
    const scriptRuntime = createFakeScriptRuntime({
      run: () => Effect.succeed({ value: 1, feedback: "ok", duration: 1, tokens: 0, cost: 0 }),
    })
    const published: unknown[] = []
    const publisher = createNoopPublisher({
      publish: (_queue, _task, payload) =>
        Effect.sync(() => {
          published.push(payload)
        }),
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase({ ...INPUT, embeddingWaitAttempt: 99 }).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
            publisher,
            billingLayer: createBillingLayer(),
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
    expect(published).toHaveLength(0)
    expect(scriptRuntime.calls.run).toHaveLength(1)
  })

  it("persists the live evaluation result through the canonical score write path after hosted execution", async () => {
    const evaluation = makeEvaluation({
      script: VALID_SCRIPT,
    })
    const issue = makeSignal({
      id: SignalId(evaluation.signalId),
    })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository((signalId) => {
      expect(signalId).toEqual(SignalId(evaluation.signalId))
      return Effect.succeed(issue)
    })
    const { operations, persistedScores, inserted, outboxEvents, scoreWriteLayer } = createTrackedScoreWriteFixture()
    const aiDuration = 456_000_000
    const aiTokens = 120
    const aiTokenUsage = {
      input: 40,
      output: aiTokens - 40,
    }
    const cost = estimateEvaluationScriptCostMicrocents({ tokens: aiTokens, tokenUsage: aiTokenUsage })
    const { layer: aiLayer } = createFakeAI()
    const scriptRuntime = createFakeScriptRuntime({
      run: () =>
        Effect.succeed({
          value: 1,
          feedback: "The conversation does not exhibit the linked issue.",
          duration: aiDuration,
          tokens: aiTokens,
          cost,
        }),
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreWriteLayer,
            signalRepository,
            aiLayer,
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
    if (result.action !== "persisted") throw new Error("Expected a persisted live evaluation result")

    expect(result.summary).toEqual({
      evaluationId: evaluation.id,
      signalId: evaluation.signalId,
      traceId: traceDetail.traceId,
      sessionId: traceDetail.sessionId,
      scoreId: result.context.score.id,
    })
    expect(result.context).toMatchObject({
      evaluation,
      traceDetail,
      issue: {
        name: issue.name,
        description: issue.description,
      },
      execution: {
        kind: "completed",
        result: {
          passed: true,
          value: 1,
          feedback: "The conversation does not exhibit the linked issue.",
        },
        duration: aiDuration,
        tokens: aiTokens,
        cost: estimateEvaluationScriptCostMicrocents({
          tokens: aiTokens,
          tokenUsage: aiTokenUsage,
        }),
      },
      score: {
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        sessionId: traceDetail.sessionId,
        traceId: traceDetail.traceId,
        spanId: traceDetail.rootSpanId,
        simulationId: null,
        sourceType: "evaluation",
        sourceId: evaluation.id,
        signalId: evaluation.signalId,
        value: 1,
        passed: true,
        feedback: "The conversation does not exhibit the linked issue.",
        metadata: {
          evaluationHash: evaluation.alignment?.evaluationHash,
        },
        error: null,
        errored: false,
        duration: aiDuration,
        tokens: aiTokens,
        cost: estimateEvaluationScriptCostMicrocents({
          tokens: aiTokens,
          tokenUsage: aiTokenUsage,
        }),
        draftedAt: null,
        annotatorId: null,
      },
    })
    expect(persistedScores.get(result.context.score.id)).toEqual(result.context.score)
    expect(inserted).toEqual([result.context.score.id])
    expect(outboxEvents.map((event) => (event as { eventName: string }).eventName)).toEqual([
      "BillingUsagePeriodUpdated",
      "ScoreCreated",
    ])
    expect(scriptRuntime.calls.run).toHaveLength(1)
    expectImmutableAnalyticsSyncOrder(operations)
  })

  it("leaves the score unassigned for a failing live evaluation result", async () => {
    const evaluation = makeEvaluation({
      script: VALID_SCRIPT,
    })
    const issue = makeSignal({
      id: SignalId(evaluation.signalId),
    })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository((signalId) => {
      expect(signalId).toEqual(SignalId(evaluation.signalId))
      return Effect.succeed(issue)
    })
    const { operations, persistedScores, inserted, outboxEvents, scoreWriteLayer } = createTrackedScoreWriteFixture()
    const aiDuration = 321_000_000
    const aiTokens = 90
    const aiTokenUsage = {
      input: 30,
      output: aiTokens - 30,
    }
    const cost = estimateEvaluationScriptCostMicrocents({ tokens: aiTokens, tokenUsage: aiTokenUsage })
    const { layer: aiLayer } = createFakeAI()
    const scriptRuntime = createFakeScriptRuntime({
      run: () =>
        Effect.succeed({
          value: 0,
          feedback: "The conversation exhibits the linked issue.",
          duration: aiDuration,
          tokens: aiTokens,
          cost,
        }),
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreWriteLayer,
            signalRepository,
            aiLayer,
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
    if (result.action !== "persisted") throw new Error("Expected a persisted live evaluation result")

    expect(result.context.score).toMatchObject({
      organizationId: INPUT.organizationId,
      projectId: INPUT.projectId,
      sessionId: traceDetail.sessionId,
      traceId: traceDetail.traceId,
      spanId: traceDetail.rootSpanId,
      simulationId: null,
      sourceType: "evaluation",
      sourceId: evaluation.id,
      signalId: null,
      value: 0,
      passed: false,
      feedback: "The conversation exhibits the linked issue.",
      metadata: {
        evaluationHash: evaluation.alignment?.evaluationHash,
      },
      error: null,
      errored: false,
      duration: aiDuration,
      tokens: aiTokens,
      cost: estimateEvaluationScriptCostMicrocents({
        tokens: aiTokens,
        tokenUsage: aiTokenUsage,
      }),
      draftedAt: null,
      annotatorId: null,
    })
    expect(result.context.execution).toMatchObject({
      kind: "completed",
      result: {
        passed: false,
        value: 0,
        feedback: "The conversation exhibits the linked issue.",
      },
      duration: aiDuration,
      tokens: aiTokens,
      cost: estimateEvaluationScriptCostMicrocents({
        tokens: aiTokens,
        tokenUsage: aiTokenUsage,
      }),
    })
    expect(persistedScores.get(result.context.score.id)).toEqual(result.context.score)
    expect(inserted).toEqual([result.context.score.id])
    expect(outboxEvents.map((event) => (event as { eventName: string }).eventName)).toEqual([
      "BillingUsagePeriodUpdated",
      "ScoreCreated",
    ])
    expectImmutableAnalyticsSyncOrder(operations)
  })

  it("persists an errored live evaluation score when execution fails", async () => {
    const evaluation = makeEvaluation({
      script: VALID_SCRIPT,
    })
    const issue = makeSignal({
      id: SignalId(evaluation.signalId),
    })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository((signalId) => {
      expect(signalId).toEqual(SignalId(evaluation.signalId))
      return Effect.succeed(issue)
    })
    const { operations, persistedScores, inserted, outboxEvents, scoreWriteLayer } = createTrackedScoreWriteFixture()
    const { layer: aiLayer } = createFakeAI()
    const scriptRuntime = createFakeScriptRuntime({
      run: () => Effect.fail(new ScriptRuntimeError({ message: "evaluation script failed: upstream timeout" })),
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreWriteLayer,
            signalRepository,
            aiLayer,
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
    if (result.action !== "persisted") throw new Error("Expected a persisted live evaluation result")

    expect(result.context.execution.kind).toBe("errored")
    if (result.context.execution.kind !== "errored") throw new Error("Expected an errored execution result")

    expect(result.context.execution).toMatchObject({
      kind: "errored",
      error: "evaluation script failed: upstream timeout",
      tokens: 0,
      cost: 0,
    })
    expect(result.context.execution.duration).toBeGreaterThanOrEqual(0)

    expect(result.context.score).toMatchObject({
      organizationId: INPUT.organizationId,
      projectId: INPUT.projectId,
      sessionId: traceDetail.sessionId,
      traceId: traceDetail.traceId,
      spanId: traceDetail.rootSpanId,
      simulationId: null,
      sourceType: "evaluation",
      sourceId: evaluation.id,
      signalId: null,
      value: 0,
      passed: false,
      feedback: "evaluation script failed: upstream timeout",
      metadata: {
        evaluationHash: evaluation.alignment?.evaluationHash,
      },
      error: "evaluation script failed: upstream timeout",
      errored: true,
      duration: result.context.execution.duration,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      annotatorId: null,
    })
    expect(persistedScores.get(result.context.score.id)).toEqual(result.context.score)
    expect(inserted).toEqual([result.context.score.id])
    expect(outboxEvents.map((event) => (event as { eventName: string }).eventName)).toEqual([
      "BillingUsagePeriodUpdated",
      "ScoreCreated",
    ])
    expect(scriptRuntime.calls.run).toHaveLength(1)
    expectImmutableAnalyticsSyncOrder(operations)
  })

  it("executes deterministic (non-template) scripts through the sandbox runtime", async () => {
    const evaluation = makeEvaluation({
      // A deterministic script with no llm() call — only executable by the sandbox runtime.
      script: "return Passed(1, 'no exhibition')",
    })
    const issue = makeSignal({
      id: SignalId(evaluation.signalId),
    })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() => Effect.succeed(issue))
    const scriptRuntime = createFakeScriptRuntime({
      run: () => Effect.succeed({ value: 1, feedback: "no exhibition", duration: 9_000, tokens: 0, cost: 0 }),
    })
    const { layer: aiLayer, calls } = createFakeAI()

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
            aiLayer,
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
    if (result.action !== "persisted") throw new Error("Expected a persisted live evaluation result")
    expect(result.context.execution).toMatchObject({
      kind: "completed",
      result: { passed: true, value: 1, feedback: "no exhibition" },
      duration: 9_000,
      tokens: 0,
      cost: 0,
    })
    expect(scriptRuntime.calls.run).toHaveLength(1)
    expect(scriptRuntime.calls.run[0]?.script.source).toBe(evaluation.script)
    expect(calls.generate).toHaveLength(0)
  })

  it("records detector health per run and surfaces the degraded transition through the outbox once", async () => {
    const evaluation = makeEvaluation({
      script: VALID_SCRIPT,
    })
    const issue = makeSignal({
      id: SignalId(evaluation.signalId),
    })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() => Effect.succeed(issue))
    const { outboxEvents, scoreWriteLayer } = createTrackedScoreWriteFixture()
    const detectorHealth = createFakeDetectorHealthTracker({
      recordRun: () => Effect.succeed({ runs: 20, errors: 11, degraded: true, newlyDegraded: true }),
    })
    const { layer: aiLayer } = createFakeAI()
    const scriptRuntime = createFakeScriptRuntime({
      run: () => Effect.fail(new ScriptRuntimeError({ message: "evaluation script failed: upstream timeout" })),
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreWriteLayer,
            signalRepository,
            aiLayer,
            detectorHealthLayer: detectorHealth.layer,
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
    expect(detectorHealth.calls).toEqual([
      {
        organizationId: OrganizationId(INPUT.organizationId),
        projectId: ProjectId(INPUT.projectId),
        ownerType: "evaluation",
        ownerId: evaluation.id,
        errored: true,
      },
    ])
    const degradedEvents = outboxEvents.filter(
      (event) => (event as { eventName: string }).eventName === "EvaluationDetectorDegraded",
    )
    expect(degradedEvents).toEqual([
      {
        eventName: "EvaluationDetectorDegraded",
        aggregateType: "evaluation",
        aggregateId: evaluation.id,
        organizationId: INPUT.organizationId,
        payload: {
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          evaluationId: evaluation.id,
          runs: 20,
          errors: 11,
          windowSeconds: 3600,
        },
      },
    ])
  })

  it("does not let detector-health failures replace the run outcome", async () => {
    const evaluation = makeEvaluation({
      script: VALID_SCRIPT,
    })
    const issue = makeSignal({
      id: SignalId(evaluation.signalId),
    })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const signalRepository = createSignalRepository(() => Effect.succeed(issue))
    const detectorHealth = createFakeDetectorHealthTracker({
      recordRun: () => Effect.fail(new CacheError({ message: "redis unavailable" })),
    })
    const { layer: aiLayer } = createFakeAI()
    const scriptRuntime = createFakeScriptRuntime({
      run: () => Effect.succeed({ value: 1, feedback: "ok", duration: 1_000, tokens: 120, cost: 0 }),
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            signalRepository,
            aiLayer,
            detectorHealthLayer: detectorHealth.layer,
            scriptRuntimeLayer: scriptRuntime.layer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
  })
})
