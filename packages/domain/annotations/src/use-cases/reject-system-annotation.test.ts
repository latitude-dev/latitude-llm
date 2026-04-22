import { OutboxEventWriter } from "@domain/events"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, ScoreId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { rejectSystemAnnotationUseCase } from "./reject-system-annotation.ts"

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

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const createFakeOutboxEventWriter = () => {
  const events: unknown[] = []
  const outboxEventWriter = {
    write: (event: unknown) =>
      Effect.sync(() => {
        events.push(event)
      }),
  }
  return { outboxEventWriter, events }
}

describe("rejectSystemAnnotationUseCase", () => {
  it("deletes the draft, emits AnnotationDeleted, and enqueues a reject review with the trimmed comment", async () => {
    const draft = buildSystemDraftAnnotation()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(draft.id, draft)
    const { outboxEventWriter, events } = createFakeOutboxEventWriter()
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      rejectSystemAnnotationUseCase({ scoreId: draft.id, comment: "   hallucinated the date   " }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(OutboxEventWriter, outboxEventWriter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createPassthroughSqlClient()),
          ),
        ),
      ),
    )

    expect(scores.has(draft.id)).toBe(false)
    expect(events).toEqual([
      expect.objectContaining({
        eventName: "AnnotationDeleted",
        aggregateType: "score",
        aggregateId: draft.id,
        organizationId,
        payload: expect.objectContaining({
          scoreId: draft.id,
          projectId,
          draftedAt: draft.draftedAt?.toISOString(),
          feedback: draft.feedback,
          source: "annotation",
        }),
      }),
    ])
    expect(published).toEqual([
      {
        queue: "product-feedback",
        task: "submitSystemAnnotatorReview",
        payload: {
          upstreamScoreId: draft.id,
          review: { decision: "reject", comment: "hallucinated the date" },
        },
        options: { dedupeKey: `submitSystemAnnotatorReview:${draft.id}:reject` },
      },
    ])
  })

  it("fails when the comment is whitespace-only and does nothing", async () => {
    const draft = buildSystemDraftAnnotation()
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(draft.id, draft)
    const { outboxEventWriter, events } = createFakeOutboxEventWriter()
    const { publisher, published } = createFakeQueuePublisher()

    const exit = await Effect.runPromiseExit(
      rejectSystemAnnotationUseCase({ scoreId: draft.id, comment: "   \n   " }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(OutboxEventWriter, outboxEventWriter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createPassthroughSqlClient()),
          ),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(scores.has(draft.id)).toBe(true)
    expect(events).toEqual([])
    expect(published).toEqual([])
  })

  it("fails when the score belongs to a human annotator", async () => {
    const human = buildSystemDraftAnnotation({ annotatorId: UserId("u".repeat(24)) })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(human.id, human)
    const { outboxEventWriter, events } = createFakeOutboxEventWriter()
    const { publisher, published } = createFakeQueuePublisher()

    const exit = await Effect.runPromiseExit(
      rejectSystemAnnotationUseCase({ scoreId: human.id, comment: "some reason" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(OutboxEventWriter, outboxEventWriter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createPassthroughSqlClient()),
          ),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(scores.has(human.id)).toBe(true)
    expect(events).toEqual([])
    expect(published).toEqual([])
  })

  it("fails when the system annotation has already been published", async () => {
    const publishedScore = buildSystemDraftAnnotation({ draftedAt: null })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(publishedScore.id, publishedScore)
    const { outboxEventWriter, events } = createFakeOutboxEventWriter()
    const { publisher, published } = createFakeQueuePublisher()

    const exit = await Effect.runPromiseExit(
      rejectSystemAnnotationUseCase({ scoreId: publishedScore.id, comment: "too late" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(OutboxEventWriter, outboxEventWriter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createPassthroughSqlClient()),
          ),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(scores.has(publishedScore.id)).toBe(true)
    expect(events).toEqual([])
    expect(published).toEqual([])
  })

  it("fails when the score does not exist", async () => {
    const { repository: scoreRepository } = createFakeScoreRepository()
    const { outboxEventWriter, events } = createFakeOutboxEventWriter()
    const { publisher, published } = createFakeQueuePublisher()

    const exit = await Effect.runPromiseExit(
      rejectSystemAnnotationUseCase({ scoreId: ScoreId("x".repeat(24)), comment: "reason" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ScoreRepository, scoreRepository),
            Layer.succeed(OutboxEventWriter, outboxEventWriter),
            Layer.succeed(QueuePublisher, publisher),
            Layer.succeed(SqlClient, createPassthroughSqlClient()),
          ),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
    expect(events).toEqual([])
    expect(published).toEqual([])
  })
})
