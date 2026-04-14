import {
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared"
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
import { EvaluationRepository, type EvaluationRepositoryShape } from "../../ports/evaluation-repository.ts"
import { runLiveEvaluationUseCase } from "./run-live-evaluation.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  evaluationId: "c".repeat(24),
  traceId: "d".repeat(32),
} as const

function makeTraceDetail(overrides?: Partial<Pick<TraceDetail, "projectId" | "traceId" | "sessionId">>): TraceDetail {
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
    allMessages: [],
  }
}

function makeEvaluation(overrides?: Partial<Pick<Evaluation, "id" | "organizationId" | "projectId" | "issueId">>) {
  return evaluationSchema.parse({
    id: overrides?.id ?? INPUT.evaluationId,
    organizationId: overrides?.organizationId ?? INPUT.organizationId,
    projectId: overrides?.projectId ?? INPUT.projectId,
    issueId: overrides?.issueId ?? "i".repeat(24),
    name: "Live evaluation",
    description: "Detects the linked issue on live traces.",
    script: "const result = true",
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash"),
    alignedAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  })
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

function createUseCaseLayer(input: {
  readonly traceRepository: ReturnType<typeof createFakeTraceRepository>["repository"]
  readonly evaluationRepository: EvaluationRepositoryShape
}) {
  return Layer.mergeAll(
    Layer.succeed(TraceRepository, input.traceRepository),
    Layer.succeed(EvaluationRepository, input.evaluationRepository),
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

  it("loads the evaluation and trace context for later execution steps", async () => {
    const evaluation = makeEvaluation()
    const traceDetail = makeTraceDetail()
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
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
      action: "loaded",
      summary: {
        evaluationId: evaluation.id,
        issueId: evaluation.issueId,
        traceId: traceDetail.traceId,
        sessionId: traceDetail.sessionId,
      },
      context: {
        evaluation,
        traceDetail,
      },
    })
  })
})
