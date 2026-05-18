import { createFakeAI } from "@domain/ai/testing"
import { type Score, ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
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
    annotatorId: null,
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
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
      ),
    )

    expect(aiCalls.embed).toHaveLength(1)
    expect(aiCalls.embed[0]).toMatchObject({
      text: score.feedback,
      model: CENTROID_EMBEDDING_MODEL,
      dimensions: CENTROID_EMBEDDING_DIMENSIONS,
    })
    expect(result.normalizedEmbedding[0]).toBeCloseTo(0.6)
    expect(result.normalizedEmbedding[1]).toBeCloseTo(0.8)
    expect(result.rawFeedback).toBeUndefined()
    expect(result.rawNormalizedEmbedding).toBeUndefined()
  })

  it("also embeds raw annotation feedback when it differs from enriched feedback", async () => {
    const score = makeScore({
      feedback: "Clusterable enriched feedback",
      metadata: { rawFeedback: "raw human feedback" },
    })
    const { repository, scores } = createFakeScoreRepository()
    scores.set(score.id, score)

    const { layer: aiLayer, calls: aiCalls } = createFakeAI({
      embed: (input) => Effect.succeed({ embedding: input.text === score.feedback ? [3, 4] : [5, 12] }),
    })

    const result = await Effect.runPromise(
      embedScoreFeedbackUseCase({ organizationId, projectId, scoreId: score.id }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(ScoreRepository, repository),
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
      ),
    )

    expect(aiCalls.embed.map((call) => call.text)).toEqual([score.feedback, "raw human feedback"])
    expect(result.normalizedEmbedding[0]).toBeCloseTo(0.6)
    expect(result.normalizedEmbedding[1]).toBeCloseTo(0.8)
    expect(result.rawFeedback).toBe("raw human feedback")
    expect(result.rawNormalizedEmbedding?.[0]).toBeCloseTo(5 / 13)
    expect(result.rawNormalizedEmbedding?.[1]).toBeCloseTo(12 / 13)
  })
})
