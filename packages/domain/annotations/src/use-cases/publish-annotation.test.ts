import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { ScoreId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { publishAnnotationUseCase } from "./publish-annotation.ts"

const cuid = "a".repeat(24)
const scoreCuid = ScoreId("s".repeat(24))
const projectCuid = "b".repeat(24)

function buildDraftAnnotationScore(): Score {
  return {
    id: scoreCuid,
    organizationId: cuid,
    projectId: projectCuid,
    sessionId: null,
    traceId: null,
    spanId: null,
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    issueId: null,
    value: 0.2,
    passed: false,
    feedback: "The model hallucinated a date",
    metadata: {
      rawFeedback: "The model hallucinated a date",
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: new Date("2026-03-24T00:00:00.000Z"),
    createdAt: new Date("2026-03-24T00:00:00.000Z"),
    updatedAt: new Date("2026-03-24T00:00:00.000Z"),
  } as Score
}

const createWorkflowStarter = () => {
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
    signalWithStart: () => Effect.die("signalWithStart should not be called in publishAnnotationUseCase tests"),
  }

  return { workflowStarter, startedWorkflows }
}

describe("publishAnnotationUseCase", () => {
  it("starts the publication workflow for a draft annotation score", async () => {
    const draft = buildDraftAnnotationScore()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(draft.id, draft)
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()

    const result = await Effect.runPromise(
      publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
          ),
        ),
      ),
    )

    expect(result).toEqual({
      action: "workflow-started",
      scoreId: scoreCuid,
    })
    expect(scores.get(scoreCuid)?.draftedAt).not.toBeNull()
    expect(startedWorkflows).toEqual([
      {
        workflow: "publishAnnotationWorkflow",
        input: {
          organizationId: cuid,
          projectId: projectCuid,
          scoreId: scoreCuid,
        },
        options: {
          workflowId: `annotations:publish:${scoreCuid}`,
        },
      },
    ])
  })

  it("is idempotent on already-published annotation", async () => {
    const published = { ...buildDraftAnnotationScore(), draftedAt: null } as Score
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(published.id, published)
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()

    const result = await Effect.runPromise(
      publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
          ),
        ),
      ),
    )

    expect(result.action).toBe("already-published")
    if (result.action !== "already-published") throw new Error("expected already-published")
    expect(result.score.draftedAt).toBeNull()
    expect(startedWorkflows).toHaveLength(0)
  })

  it("returns BadRequestError for non-existent score", async () => {
    const { repository: scoreRepository } = createFakeScoreRepository()
    const { workflowStarter } = createWorkflowStarter()

    const exit = await Effect.runPromiseExit(
      publishAnnotationUseCase({ scoreId: ScoreId("x".repeat(24)) }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
          ),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
  })

  it("returns BadRequestError for non-annotation score", async () => {
    const customScore = {
      ...buildDraftAnnotationScore(),
      source: "custom",
      sourceId: "batch-import",
      metadata: { reviewer: "test" },
    } as Score
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(customScore.id, customScore)
    const { workflowStarter } = createWorkflowStarter()

    const exit = await Effect.runPromiseExit(
      publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
          ),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
  })
})
