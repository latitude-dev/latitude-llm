import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { defaultEvaluationTrigger, emptyEvaluationAlignment, evaluationSchema } from "../../entities/evaluation.ts"
import {
  type EvaluationListPage,
  EvaluationRepository,
  type EvaluationRepositoryShape,
} from "../../ports/evaluation-repository.ts"
import { enqueueLiveEvaluationsUseCase } from "./enqueue-live-evaluations.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  traceId: "c".repeat(32),
} as const

function makeTraceDetail(): TraceDetail {
  return {
    organizationId: OrganizationId(INPUT.organizationId),
    projectId: ProjectId(INPUT.projectId),
    traceId: TraceId(INPUT.traceId),
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
    sessionId: SessionId("session"),
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

function makeEvaluation(
  id: string,
  options?: {
    readonly sampling?: number
  },
) {
  const trigger = defaultEvaluationTrigger()

  return evaluationSchema.parse({
    id,
    organizationId: INPUT.organizationId,
    projectId: INPUT.projectId,
    issueId: "i".repeat(24),
    name: `Eval ${id.slice(-4)}`,
    description: "Live evaluation",
    script: "export default async function evaluate() { return { score: 1 } }",
    trigger: {
      ...trigger,
      ...(options?.sampling !== undefined ? { sampling: options.sampling } : {}),
    },
    alignment: emptyEvaluationAlignment("hash"),
    alignedAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  })
}

function createEvaluationRepository(
  listByProjectId: EvaluationRepositoryShape["listByProjectId"],
): EvaluationRepositoryShape {
  return {
    findById: () => Effect.die("Unexpected call to findById"),
    save: () => Effect.die("Unexpected call to save"),
    listByProjectId,
    listByIssueId: () => Effect.die("Unexpected call to listByIssueId"),
    archive: () => Effect.die("Unexpected call to archive"),
    unarchive: () => Effect.die("Unexpected call to unarchive"),
    softDelete: () => Effect.die("Unexpected call to softDelete"),
    archiveByIssueId: () => Effect.die("Unexpected call to archiveByIssueId"),
  }
}

describe("enqueueLiveEvaluationsUseCase", () => {
  it("skips when the ended trace no longer exists", async () => {
    const { repository: traceRepository } = createFakeTraceRepository()
    const evaluationRepository = createEvaluationRepository(() =>
      Effect.die("Active evaluations should not be listed when the trace is missing"),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          Layer.merge(
            Layer.succeed(TraceRepository, traceRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
          ),
        ),
      ),
    )

    expect(result).toEqual({
      action: "skipped",
      reason: "trace-not-found",
      traceId: INPUT.traceId,
    })
  })

  it("loads the trace and paginates active evaluations", async () => {
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
    })

    const recordedCalls: Array<{
      readonly projectId: string
      readonly lifecycle: string | undefined
      readonly limit: number | undefined
      readonly offset: number
    }> = []

    const pages = new Map<number, EvaluationListPage>([
      [
        0,
        {
          items: [makeEvaluation("e".repeat(24))],
          hasMore: true,
          limit: 100,
          offset: 0,
        },
      ],
      [
        100,
        {
          items: [makeEvaluation("f".repeat(24))],
          hasMore: false,
          limit: 100,
          offset: 100,
        },
      ],
    ])

    const evaluationRepository = createEvaluationRepository(({ projectId, options }) => {
      recordedCalls.push({
        projectId,
        lifecycle: options?.lifecycle,
        limit: options?.limit,
        offset: options?.offset ?? 0,
      })

      const page = pages.get(options?.offset ?? 0) ?? pages.get(100)
      if (page === undefined) {
        return Effect.die("Expected a seeded evaluation page")
      }

      return Effect.succeed(page)
    })

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          Layer.merge(
            Layer.succeed(TraceRepository, traceRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
          ),
        ),
      ),
    )

    expect(recordedCalls).toEqual([
      {
        projectId: INPUT.projectId,
        lifecycle: "active",
        limit: 100,
        offset: 0,
      },
      {
        projectId: INPUT.projectId,
        lifecycle: "active",
        limit: 100,
        offset: 100,
      },
    ])
    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 2,
        filterMatchedCount: 0,
        skippedPausedCount: 0,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 0,
      },
    })
  })

  it("counts sampling=0 evaluations as paused skips", async () => {
    const { repository: traceRepository } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(makeTraceDetail()),
    })

    const evaluationRepository = createEvaluationRepository(() =>
      Effect.succeed({
        items: [makeEvaluation("e".repeat(24)), makeEvaluation("f".repeat(24), { sampling: 0 })],
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    )

    const result = await Effect.runPromise(
      enqueueLiveEvaluationsUseCase(INPUT).pipe(
        Effect.provide(
          Layer.merge(
            Layer.succeed(TraceRepository, traceRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
          ),
        ),
      ),
    )

    expect(result).toEqual({
      action: "completed",
      summary: {
        traceId: INPUT.traceId,
        sessionId: "session",
        activeEvaluationsScanned: 2,
        filterMatchedCount: 0,
        skippedPausedCount: 1,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 0,
      },
    })
  })
})
