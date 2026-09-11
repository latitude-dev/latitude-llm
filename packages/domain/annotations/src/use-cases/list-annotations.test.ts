import { type Score, ScoreRepository, scoreSchema } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { listTraceAnnotationsUseCase } from "./list-annotations.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const traceId = "t".repeat(32)

const annotation = (id: string, overrides: Partial<Score> = {}): Score =>
  scoreSchema.parse({
    id: id.padEnd(24, "x").slice(0, 24),
    organizationId,
    projectId,
    sessionId: null,
    traceId,
    spanId: null,
    simulationId: null,
    signalId: null,
    sourceType: "annotation",
    sourceId: "UI",
    value: 0,
    passed: false,
    feedback: `Feedback ${id}`,
    metadata: { rawFeedback: `Feedback ${id}` },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  })

const listWith = (items: readonly Score[]) => {
  const { repository } = createFakeScoreRepository({
    listByTraceId: () => Effect.succeed({ items, hasMore: false, limit: 50, offset: 0 }),
  })

  return Effect.runPromise(
    listTraceAnnotationsUseCase({ projectId, traceId }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(ScoreRepository, repository),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
        ),
      ),
    ),
  )
}

describe("listTraceAnnotationsUseCase", () => {
  // Outcome's judge persists a passed score for every session it finds
  // successful, so the rate has a denominator. That is a measurement, not
  // something a reviewer wrote, and it would otherwise appear here as a green
  // card nobody authored.
  it("omits a flagger's positive reference verdict", async () => {
    const page = await listWith([
      annotation("human-negative"),
      annotation("human-positive", { passed: true, value: 1 }),
      annotation("judge-success", {
        passed: true,
        value: 1,
        sourceId: "SYSTEM",
        metadata: { rawFeedback: "raw", flaggerSlug: "task-failure", flaggerPath: "sampled" },
      }),
    ])

    expect(page.items.map((score) => score.id)).toEqual([
      "human-negative".padEnd(24, "x").slice(0, 24),
      "human-positive".padEnd(24, "x").slice(0, 24),
    ])
  })

  it("keeps a flagger's negative annotation, which a reviewer does act on", async () => {
    const page = await listWith([
      annotation("judge-failure", {
        sourceId: "SYSTEM",
        metadata: { rawFeedback: "raw", flaggerSlug: "task-failure", flaggerPath: "sampled" },
      }),
    ])

    expect(page.items).toHaveLength(1)
  })
})
