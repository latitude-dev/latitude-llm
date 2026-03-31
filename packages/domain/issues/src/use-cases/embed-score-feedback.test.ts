import { AI, withAICache } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { type Score, ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS, CENTROID_EMBEDDING_MODEL } from "../constants.ts"
import { embedScoreFeedbackUseCase } from "./embed-score-feedback.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const makeScore = (overrides: Partial<Score> = {}): Score =>
  scoreSchema.parse({
    id: "ssssssssssssssssssssssss",
    organizationId,
    projectId,
    sessionId: null,
    traceId: null,
    spanId: null,
    simulationId: null,
    issueId: null,
    source: "annotation",
    sourceId: "UI",
    value: 0.1,
    passed: false,
    feedback: "The issue discovery feedback text",
    metadata: { rawFeedback: "The issue discovery feedback text" },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    createdAt: new Date("2026-03-31T00:00:00.000Z"),
    updatedAt: new Date("2026-03-31T00:00:00.000Z"),
    ...overrides,
  })

describe("embedScoreFeedbackUseCase", () => {
  it("embeds with enforced model/dimensions and normalizes output", async () => {
    const score = makeScore()
    const { repository, scores } = createFakeScoreRepository()
    scores.set(score.id, score)

    const { layer: aiLayer, calls: aiCalls } = createFakeAI({
      embed: () => Effect.succeed({ embedding: [3, 4] }),
    })

    const result = await Effect.runPromise(
      embedScoreFeedbackUseCase({ organizationId, projectId, scoreId: score.id }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, repository),
      ),
    )

    expect(aiCalls.embed).toHaveLength(1)
    expect(aiCalls.embed[0]).toEqual({
      text: score.feedback,
      model: CENTROID_EMBEDDING_MODEL,
      dimensions: CENTROID_EMBEDDING_DIMENSIONS,
    })
    expect(result.normalizedEmbedding).toEqual([0.6, 0.8])
  })

  it("uses cache for repeated embedding input in issue discovery flow", async () => {
    const score = makeScore()
    const { repository, scores } = createFakeScoreRepository()
    scores.set(score.id, score)

    const { ai, calls: aiCalls } = createFakeAI({
      embed: () => Effect.succeed({ embedding: [3, 4] }),
    })

    const cache = new Map<string, string>()
    const aiLayer = Layer.succeed(
      AI,
      withAICache(ai, {
        get: (key) => Effect.succeed(cache.get(key) ?? null),
        set: (key, value) =>
          Effect.sync(() => {
            cache.set(key, value)
          }),
        delete: (key) =>
          Effect.sync(() => {
            cache.delete(key)
          }),
      }),
    )

    const first = await Effect.runPromise(
      embedScoreFeedbackUseCase({ organizationId, projectId, scoreId: score.id }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, repository),
      ),
    )

    const second = await Effect.runPromise(
      embedScoreFeedbackUseCase({ organizationId, projectId, scoreId: score.id }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, repository),
      ),
    )

    expect(first.normalizedEmbedding).toEqual([0.6, 0.8])
    expect(second.normalizedEmbedding).toEqual([0.6, 0.8])
    expect(aiCalls.embed).toHaveLength(1)
  })
})
