import { OrganizationId, OutboxEventWriter, SessionId, SpanId, SqlClient, TraceId, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { ScoreAnalyticsRepository } from "../ports/score-analytics-repository.ts"
import { ScoreRepository } from "../ports/score-repository.ts"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "../testing/index.ts"
import { writeScoreUseCase } from "./write-score.ts"

const cuid = "a".repeat(24)
const projectCuid = "b".repeat(24)
const evaluationCuid = "c".repeat(24)
const traceId = TraceId("d".repeat(32))
const spanId = SpanId("e".repeat(16))

function createTestLayers() {
  const events: unknown[] = []
  const { repository: scoreRepository, scores: store } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()

  const ScoreRepositoryTest = Layer.succeed(ScoreRepository, scoreRepository)
  const ScoreAnalyticsRepositoryTest = Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository)

  const OutboxEventWriterTest = Layer.succeed(OutboxEventWriter, {
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })

  const SqlClientTest = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid) }))

  return {
    store,
    events,
    layer: Layer.mergeAll(ScoreRepositoryTest, ScoreAnalyticsRepositoryTest, OutboxEventWriterTest, SqlClientTest),
  }
}

function buildEvaluationScoreInput(overrides?: Record<string, unknown>) {
  return {
    projectId: projectCuid,
    source: "evaluation" as const,
    sourceId: evaluationCuid,
    sessionId: SessionId("session-1"),
    traceId,
    spanId,
    value: 0.8,
    passed: true,
    feedback: "Model followed instructions correctly.",
    metadata: { evaluationHash: "sha256:abc123" },
    ...overrides,
  }
}

describe("writeScoreUseCase", () => {
  it("creates a score with the provided annotatorId", async () => {
    const annotatorId = UserId("u".repeat(24))
    const { store, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeScoreUseCase({
        ...buildEvaluationScoreInput(),
        annotatorId,
      }).pipe(Effect.provide(layer)),
    )

    expect(score.annotatorId).toBe(annotatorId)
    expect(store.size).toBe(1)
  })

  it("preserves original annotatorId when updating a draft score", async () => {
    const originalAnnotatorId = UserId("o".repeat(24))
    const differentAnnotatorId = UserId("d".repeat(24))
    const { store, layer } = createTestLayers()

    const first = await Effect.runPromise(
      writeScoreUseCase({
        ...buildEvaluationScoreInput(),
        annotatorId: originalAnnotatorId,
        draftedAt: new Date(),
      }).pipe(Effect.provide(layer)),
    )

    expect(first.annotatorId).toBe(originalAnnotatorId)

    const updated = await Effect.runPromise(
      writeScoreUseCase({
        ...buildEvaluationScoreInput(),
        id: first.id,
        annotatorId: differentAnnotatorId,
        value: 0.5,
        passed: false,
        feedback: "Revised by different user",
        draftedAt: new Date(),
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.id).toBe(first.id)
    expect(updated.feedback).toBe("Revised by different user")
    expect(updated.annotatorId).toBe(originalAnnotatorId)
    expect(store.size).toBe(1)
  })

  it("preserves annotatorId when update omits it entirely", async () => {
    const originalAnnotatorId = UserId("o".repeat(24))
    const { layer } = createTestLayers()

    const first = await Effect.runPromise(
      writeScoreUseCase({
        ...buildEvaluationScoreInput(),
        annotatorId: originalAnnotatorId,
        draftedAt: new Date(),
      }).pipe(Effect.provide(layer)),
    )

    expect(first.annotatorId).toBe(originalAnnotatorId)

    const updated = await Effect.runPromise(
      writeScoreUseCase({
        ...buildEvaluationScoreInput(),
        id: first.id,
        value: 0.3,
        passed: false,
        feedback: "Updated without annotatorId",
        draftedAt: new Date(),
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.annotatorId).toBe(originalAnnotatorId)
  })

  it("uses provided annotatorId on create when no existing score", async () => {
    const annotatorId = UserId("n".repeat(24))
    const { layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeScoreUseCase({
        ...buildEvaluationScoreInput(),
        annotatorId,
      }).pipe(Effect.provide(layer)),
    )

    expect(score.annotatorId).toBe(annotatorId)
  })

  it("defaults annotatorId to null on create when not provided", async () => {
    const { layer } = createTestLayers()

    const score = await Effect.runPromise(writeScoreUseCase(buildEvaluationScoreInput()).pipe(Effect.provide(layer)))

    expect(score.annotatorId).toBeNull()
  })
})
