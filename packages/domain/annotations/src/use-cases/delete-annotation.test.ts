import { OutboxEventWriter } from "@domain/events"
import { type Score, ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { deleteAnnotationUseCase } from "./delete-annotation.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const scoreId = ScoreId("ssssssssssssssssssssssss")
const issueId = "iiiiiiiiiiiiiiiiiiiiiiii"

const makeScore = (overrides: Partial<Score> = {}): Score =>
  scoreSchema.parse({
    id: scoreId,
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    simulationId: null,
    issueId: null,
    source: "annotation",
    sourceId: "UI",
    value: 0.2,
    passed: false,
    feedback: "The assistant leaks API tokens in its response.",
    metadata: { rawFeedback: "The assistant leaks API tokens in its response." },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-30T10:00:00.000Z"),
    updatedAt: new Date("2026-03-30T10:00:00.000Z"),
    ...overrides,
  })

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

describe("deleteAnnotationUseCase", () => {
  it("deletes an annotation from PostgreSQL and emits AnnotationDeleted event", async () => {
    const score = makeScore({ issueId, draftedAt: null })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(score.id, score)
    const { outboxEventWriter, events } = createFakeOutboxEventWriter()

    await Effect.runPromise(
      deleteAnnotationUseCase({ scoreId: score.id }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(OutboxEventWriter, outboxEventWriter),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(scores.has(score.id)).toBe(false)
    expect(events).toEqual([
      expect.objectContaining({
        eventName: "AnnotationDeleted",
        aggregateType: "score",
        aggregateId: score.id,
        organizationId,
        payload: {
          organizationId,
          projectId,
          scoreId: score.id,
          issueId,
          draftedAt: null,
          feedback: score.feedback,
          source: score.source,
          createdAt: score.createdAt.toISOString(),
        },
      }),
    ])
  })

  it("emits event with draftedAt for draft annotations", async () => {
    const draftedAt = new Date("2026-03-30T10:00:00.000Z")
    const score = makeScore({ issueId, draftedAt })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(score.id, score)
    const { outboxEventWriter, events } = createFakeOutboxEventWriter()

    await Effect.runPromise(
      deleteAnnotationUseCase({ scoreId: score.id }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(OutboxEventWriter, outboxEventWriter),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(scores.has(score.id)).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "AnnotationDeleted",
      payload: {
        draftedAt: draftedAt.toISOString(),
      },
    })
  })

  it("emits event with null issueId for annotations not linked to issue", async () => {
    const score = makeScore({ issueId: null, draftedAt: null })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(score.id, score)
    const { outboxEventWriter, events } = createFakeOutboxEventWriter()

    await Effect.runPromise(
      deleteAnnotationUseCase({ scoreId: score.id }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(OutboxEventWriter, outboxEventWriter),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(scores.has(score.id)).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "AnnotationDeleted",
      payload: {
        issueId: null,
      },
    })
  })

  it("fails when score does not exist", async () => {
    const { repository: scoreRepository } = createFakeScoreRepository()
    const { outboxEventWriter } = createFakeOutboxEventWriter()

    const exit = await Effect.runPromiseExit(
      deleteAnnotationUseCase({ scoreId: ScoreId("x".repeat(24)) }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(OutboxEventWriter, outboxEventWriter),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(exit._tag).toBe("Failure")
  })

  it("fails when trying to delete a non-annotation score", async () => {
    const evaluationScore = scoreSchema.parse({
      ...makeScore(),
      source: "evaluation",
      sourceId: "e".repeat(24),
      metadata: { evaluationHash: "abc123" },
    })
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    scores.set(evaluationScore.id, evaluationScore)
    const { outboxEventWriter } = createFakeOutboxEventWriter()

    const exit = await Effect.runPromiseExit(
      deleteAnnotationUseCase({ scoreId: evaluationScore.id }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(OutboxEventWriter, outboxEventWriter),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(exit._tag).toBe("Failure")
  })
})
