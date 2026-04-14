import type { AI, GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  ExternalUserId,
  IssueId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  defaultEvaluationTrigger,
  type Evaluation,
  emptyEvaluationAlignment,
  evaluationSchema,
} from "../../entities/evaluation.ts"
import { type EvaluationIssue, EvaluationIssueRepository } from "../../ports/evaluation-issue-repository.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../../ports/evaluation-repository.ts"
import {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  estimateEvaluationScriptCostMicrocents,
  wrapPromptAsEvaluationScript,
} from "../../runtime/evaluation-execution.ts"
import { runLiveEvaluationUseCase } from "./run-live-evaluation.ts"
import {
  ScoreWriteOutboxEventWriter,
  type ScoreWriteOutboxEventWriterShape,
} from "./score-write-outbox-event-writer.ts"

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
      "id" | "organizationId" | "projectId" | "issueId" | "script" | "trigger" | "archivedAt" | "deletedAt"
    >
  >,
) {
  return evaluationSchema.parse({
    id: overrides?.id ?? INPUT.evaluationId,
    organizationId: overrides?.organizationId ?? INPUT.organizationId,
    projectId: overrides?.projectId ?? INPUT.projectId,
    issueId: overrides?.issueId ?? "i".repeat(24),
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

function makeIssue(overrides?: Partial<Pick<EvaluationIssue, "id" | "projectId" | "name" | "description">>) {
  return {
    id: overrides?.id ?? IssueId("i".repeat(24)),
    projectId: overrides?.projectId ?? INPUT.projectId,
    name: overrides?.name ?? "Deployment checklist omission",
    description: overrides?.description ?? "The assistant fails to mention key deployment steps.",
  } satisfies EvaluationIssue
}

function createEvaluationRepository(findById: EvaluationRepositoryShape["findById"]): EvaluationRepositoryShape {
  return {
    findById,
    save: () => Effect.die("Unexpected call to save"),
    listByProjectId: () => Effect.die("Unexpected call to listByProjectId"),
    listByIssueId: () => Effect.die("Unexpected call to listByIssueId"),
    archive: () => Effect.die("Unexpected call to archive"),
    unarchive: () => Effect.die("Unexpected call to unarchive"),
    softDelete: () => Effect.die("Unexpected call to softDelete"),
    archiveByIssueId: () => Effect.die("Unexpected call to archiveByIssueId"),
  }
}

function createIssueRepository(
  findById: (id: ReturnType<typeof IssueId>) => Effect.Effect<EvaluationIssue, NotFoundError>,
) {
  return {
    findById,
  }
}

function createScoreWriteLayer(input?: {
  readonly scoreRepository?: ReturnType<typeof createFakeScoreRepository>["repository"] | undefined
  readonly scoreAnalyticsRepository?: ReturnType<typeof createFakeScoreAnalyticsRepository>["repository"] | undefined
  readonly outboxEventWriter?: ScoreWriteOutboxEventWriterShape | undefined
}): Layer.Layer<ScoreAnalyticsRepository | ScoreRepository | ScoreWriteOutboxEventWriter | SqlClient, never, never> {
  return Layer.mergeAll(
    Layer.succeed(ScoreRepository, input?.scoreRepository ?? createFakeScoreRepository().repository),
    Layer.succeed(
      ScoreAnalyticsRepository,
      input?.scoreAnalyticsRepository ?? createFakeScoreAnalyticsRepository().repository,
    ),
    Layer.succeed(
      ScoreWriteOutboxEventWriter,
      input?.outboxEventWriter ?? {
        write: () => Effect.void,
      },
    ),
    Layer.succeed(
      SqlClient,
      createFakeSqlClient({
        organizationId: OrganizationId(INPUT.organizationId),
      }),
    ),
  )
}

function createUseCaseLayer(input: {
  readonly traceRepository: ReturnType<typeof createFakeTraceRepository>["repository"]
  readonly evaluationRepository: EvaluationRepositoryShape
  readonly scoreRepository?: ReturnType<typeof createFakeScoreRepository>["repository"] | undefined
  readonly scoreWriteLayer?: ReturnType<typeof createScoreWriteLayer> | undefined
  readonly issueRepository?: ReturnType<typeof createIssueRepository> | undefined
  readonly aiLayer?: ReturnType<typeof createFakeAI>["layer"] | undefined
}): Layer.Layer<
  | AI
  | EvaluationIssueRepository
  | EvaluationRepository
  | ScoreWriteOutboxEventWriter
  | ScoreAnalyticsRepository
  | ScoreRepository
  | SqlClient
  | TraceRepository,
  never,
  never
> {
  return Layer.mergeAll(
    Layer.succeed(TraceRepository, input.traceRepository),
    Layer.succeed(EvaluationRepository, input.evaluationRepository),
    input.scoreWriteLayer ?? createScoreWriteLayer({ scoreRepository: input.scoreRepository }),
    Layer.succeed(
      EvaluationIssueRepository,
      input.issueRepository ?? createIssueRepository(() => Effect.die("Issue should not be loaded in this scenario")),
    ),
    input.aiLayer ?? createFakeAI().layer,
  )
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
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => {
        traceLoadCalls += 1
        return Effect.die("Trace should not be loaded when a canonical result already exists")
      },
    })
    const evaluation = makeEvaluation()
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const { repository: scoreRepository } = createFakeScoreRepository({
      existsByEvaluationIdAndTraceId: ({ projectId, evaluationId, traceId }) => {
        duplicateCheckCalls += 1
        expect(projectId).toEqual(ProjectId(INPUT.projectId))
        expect(evaluationId).toBe(evaluation.id)
        expect(traceId).toEqual(TraceId(INPUT.traceId))
        return Effect.succeed(true)
      },
    })

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            scoreRepository,
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
    const issueRepository = createIssueRepository(() =>
      Effect.fail(new NotFoundError({ entity: "Issue", id: evaluation.issueId })),
    )

    const result = await Effect.runPromise(
      runLiveEvaluationUseCase(INPUT).pipe(
        Effect.provide(
          createUseCaseLayer({
            traceRepository,
            evaluationRepository,
            issueRepository,
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

  it("persists the live evaluation result through the canonical score write path after hosted execution", async () => {
    const evaluation = makeEvaluation({
      script: VALID_SCRIPT,
    })
    const issue = makeIssue({
      id: IssueId(evaluation.issueId),
    })
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const evaluationRepository = createEvaluationRepository(() => Effect.succeed(evaluation))
    const issueRepository = createIssueRepository((issueId) => {
      expect(issueId).toEqual(IssueId(evaluation.issueId))
      return Effect.succeed(issue)
    })
    const { repository: scoreRepository, scores: persistedScores } = createFakeScoreRepository()
    const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const outboxEvents: unknown[] = []
    const aiDuration = 456_000_000
    const aiTokens = 120
    const aiTokenUsage = {
      input: 40,
      output: aiTokens - 40,
    }
    const { layer: aiLayer, calls } = createFakeAI({
      generate: <T>(input: GenerateInput<T>) =>
        Effect.succeed({
          object: input.schema.parse({
            passed: true,
            value: 1,
            feedback: "The conversation does not exhibit the linked issue.",
          }),
          tokens: aiTokens,
          duration: aiDuration,
          tokenUsage: aiTokenUsage,
        } satisfies GenerateResult<T>),
    })
    const scoreWriteLayer = createScoreWriteLayer({
      scoreRepository,
      scoreAnalyticsRepository,
      outboxEventWriter: {
        write: (event) =>
          Effect.sync(() => {
            outboxEvents.push(event)
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
            issueRepository,
            aiLayer,
          }),
        ),
      ),
    )

    expect(result.action).toBe("persisted")
    if (result.action !== "persisted") throw new Error("Expected a persisted live evaluation result")

    expect(result.summary).toEqual({
      evaluationId: evaluation.id,
      issueId: evaluation.issueId,
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
        source: "evaluation",
        sourceId: evaluation.id,
        issueId: null,
        value: 1,
        passed: true,
        feedback: "The conversation does not exhibit the linked issue.",
        metadata: {
          evaluationHash: evaluation.alignment.evaluationHash,
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
    expect(outboxEvents).toHaveLength(1)
    expect(calls.generate).toHaveLength(1)
  })
})
