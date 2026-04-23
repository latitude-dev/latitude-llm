import { QueuePublisher, WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, ScoreId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { approveSystemAnnotationUseCase } from "./approve-system-annotation.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const scoreId = ScoreId("s".repeat(24))
const queueId = "q".repeat(24)

function buildSystemDraftAnnotation(overrides: Partial<Score> = {}): Score {
  return {
    id: scoreId,
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    source: "annotation",
    sourceId: queueId,
    simulationId: null,
    issueId: null,
    value: 0,
    passed: false,
    feedback: "Draft feedback from the system annotator",
    metadata: { rawFeedback: "Draft feedback from the system annotator" },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: new Date("2026-04-22T10:00:00.000Z"),
    annotatorId: null,
    createdAt: new Date("2026-04-22T10:00:00.000Z"),
    updatedAt: new Date("2026-04-22T10:00:00.000Z"),
    ...overrides,
  } as Score
}

const createWorkflowStarter = () => {
  const startedWorkflows: Array<{ workflow: string; input: unknown; options: { workflowId: string } }> = []
  const workflowStarter: WorkflowStarterShape = {
    start: (workflow, input, options) =>
      Effect.sync(() => {
        startedWorkflows.push({ workflow, input, options })
      }),
    signalWithStart: () => Effect.die("signalWithStart is not used by approveSystemAnnotationUseCase"),
  }
  return { workflowStarter, startedWorkflows }
}

describe("approveSystemAnnotationUseCase", () => {
  it("starts the publish workflow and enqueues an approve review without a comment", async () => {
    const draft = buildSystemDraftAnnotation()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(draft.id, draft)
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const { publisher, published } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      approveSystemAnnotationUseCase({ scoreId: draft.id }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
          ),
        ),
      ),
    )

    expect(result).toEqual({ action: "approved", scoreId: draft.id })
    expect(startedWorkflows).toEqual([
      {
        workflow: "publishAnnotationWorkflow",
        input: {
          organizationId,
          projectId,
          scoreId: draft.id,
          preEnrichedFeedback: draft.feedback,
        },
        options: { workflowId: `annotations:approve:${draft.id}` },
      },
    ])
    expect(published).toEqual([
      {
        queue: "product-feedback",
        task: "submitSystemAnnotatorReview",
        payload: {
          upstreamScoreId: draft.id,
          review: { decision: "approve" },
        },
        options: { dedupeKey: `submitSystemAnnotatorReview:${draft.id}:approve` },
      },
    ])
  })

  it("forwards a trimmed comment to the product-feedback payload", async () => {
    const draft = buildSystemDraftAnnotation()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(draft.id, draft)
    const { workflowStarter } = createWorkflowStarter()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      approveSystemAnnotationUseCase({ scoreId: draft.id, comment: "   looked right to me   " }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
          ),
        ),
      ),
    )

    expect(published).toHaveLength(1)
    expect(published[0]?.payload).toEqual({
      upstreamScoreId: draft.id,
      review: { decision: "approve", comment: "looked right to me" },
    })
  })

  it("omits the comment field when it is whitespace-only", async () => {
    const draft = buildSystemDraftAnnotation()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(draft.id, draft)
    const { workflowStarter } = createWorkflowStarter()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      approveSystemAnnotationUseCase({ scoreId: draft.id, comment: "   \n  " }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
          ),
        ),
      ),
    )

    expect(published[0]?.payload).toEqual({
      upstreamScoreId: draft.id,
      review: { decision: "approve" },
    })
  })

  it("returns already-published without publishing when the draft is already published", async () => {
    const published = buildSystemDraftAnnotation({ draftedAt: null })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(published.id, published)
    const { workflowStarter, startedWorkflows } = createWorkflowStarter()
    const { publisher, published: messages } = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      approveSystemAnnotationUseCase({ scoreId: published.id }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
          ),
        ),
      ),
    )

    expect(result).toEqual({ action: "already-published" })
    expect(startedWorkflows).toEqual([])
    expect(messages).toEqual([])
  })

  it("fails when the score is not a system-created annotation", async () => {
    const human = buildSystemDraftAnnotation({ annotatorId: UserId("u".repeat(24)) })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(human.id, human)
    const { workflowStarter } = createWorkflowStarter()
    const { publisher, published } = createFakeQueuePublisher()

    const exit = await Effect.runPromiseExit(
      approveSystemAnnotationUseCase({ scoreId: human.id }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(WorkflowStarter, workflowStarter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
          ),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(published).toEqual([])
  })
})
