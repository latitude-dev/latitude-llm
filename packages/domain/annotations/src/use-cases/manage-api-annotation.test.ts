import { OutboxEventWriter } from "@domain/events"
import { annotationScoreSchema, ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { updateApiAnnotationUseCase } from "./manage-api-annotation.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = ProjectId("pppppppppppppppppppppppp")
const scoreId = ScoreId("ssssssssssssssssssssssss")

const createPassthroughSqlClient = (): SqlClientShape => {
  const client: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, client)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return client
}

const score = annotationScoreSchema.parse({
  id: scoreId,
  organizationId,
  projectId,
  sessionId: "chat-1",
  traceId: "11111111111111111111111111111111",
  spanId: "1111111111111111",
  simulationId: null,
  signalId: "iiiiiiiiiiiiiiiiiiiiiiii",
  sourceType: "annotation",
  sourceId: "API",
  value: 1,
  passed: true,
  feedback: "Helpful response",
  metadata: { rawFeedback: "Helpful response", messageIndex: 2 },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  annotatorId: null,
  createdAt: new Date("2026-09-20T12:00:00.000Z"),
  updatedAt: new Date("2026-09-20T12:00:00.000Z"),
})

describe("updateApiAnnotationUseCase", () => {
  it("updates a published API annotation in place and refreshes its derived lifecycle", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: analyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const events: unknown[] = []
    scores.set(score.id, score)
    inserted.push(score.id)

    const updated = await Effect.runPromise(
      updateApiAnnotationUseCase({
        projectId,
        annotationId: score.id,
        value: 0,
        passed: false,
        feedback: "Incorrect response",
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(ScoreAnalyticsRepository, analyticsRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) => Effect.sync(() => void events.push(event)),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
      ),
    )

    expect(updated).toMatchObject({
      id: score.id,
      value: 0,
      passed: false,
      feedback: "Incorrect response",
      signalId: null,
      metadata: { rawFeedback: "Incorrect response", messageIndex: 2 },
    })
    expect(scores.get(score.id)).toEqual(updated)
    expect(inserted).toEqual([])
    expect(events).toEqual([
      expect.objectContaining({
        eventName: "AnnotationUpdated",
        aggregateId: score.id,
        payload: expect.objectContaining({
          scoreId: score.id,
          previousSignalId: score.signalId,
          previousFeedback: score.feedback,
        }),
      }),
    ])
  })

  it("repairs missing analytics when an unchanged update is retried", async () => {
    const { repository: scoreRepository, scores } = createFakeScoreRepository()
    const { repository: analyticsRepository, inserted } = createFakeScoreAnalyticsRepository()
    const events: unknown[] = []
    scores.set(score.id, score)

    const updated = await Effect.runPromise(
      updateApiAnnotationUseCase({
        projectId,
        annotationId: score.id,
        value: score.value,
        passed: score.passed,
        feedback: score.metadata.rawFeedback,
      }).pipe(
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(ScoreAnalyticsRepository, analyticsRepository),
        Effect.provideService(OutboxEventWriter, {
          write: (event) => Effect.sync(() => void events.push(event)),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
      ),
    )

    expect(updated).toEqual(score)
    expect(inserted).toEqual([score.id])
    expect(events).toEqual([])
  })
})
