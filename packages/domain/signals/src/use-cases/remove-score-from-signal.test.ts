import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { OrganizationId, SignalId, SqlClient } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid, updateSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/index.ts"
import { removeScoreFromSignalUseCase } from "./remove-score-from-signal.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = SignalId("iiiiiiiiiiiiiiiiiiiiiiii")

const makeEmbedding = (): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => {
    if (index === 0) return 0.6
    if (index === 1) return 0.8
    return 0
  })

const makeSignal = (overrides?: Partial<Signal>): Signal => ({
  id: signalId,
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  source: "annotation",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-29T10:00:00.000Z"),
  updatedAt: new Date("2026-03-29T10:00:00.000Z"),
  ...overrides,
})

const createPassthroughSqlClient = () =>
  Layer.succeed(SqlClient, {
    organizationId: OrganizationId(organizationId),
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  })

describe("removeScoreFromSignalUseCase", () => {
  it("returns skipped with reason 'draft' when draftedAt is not null", async () => {
    const result = await Effect.runPromise(
      removeScoreFromSignalUseCase({
        organizationId,
        projectId,
        signalId,
        draftedAt: new Date("2026-03-30T10:00:00.000Z"),
        feedback: "Some feedback",
        sourceType: "annotation",
        createdAt: new Date("2026-03-30T10:00:00.000Z"),
      }),
    )

    expect(result).toEqual({ action: "skipped", reason: "draft" })
  })

  it("returns skipped with reason 'not-linked' when signalId is null", async () => {
    const result = await Effect.runPromise(
      removeScoreFromSignalUseCase({
        organizationId,
        projectId,
        signalId: null,
        draftedAt: null,
        feedback: "Some feedback",
        sourceType: "annotation",
        createdAt: new Date("2026-03-30T10:00:00.000Z"),
      }),
    )

    expect(result).toEqual({ action: "skipped", reason: "not-linked" })
  })

  it("returns issue-not-found when the signal does not exist", async () => {
    const { repository: signalRepository } = createFakeSignalRepository()
    const fakeAi = createFakeAI({ embed: () => Effect.succeed({ embedding: makeEmbedding() }) })

    const layer = Layer.mergeAll(
      Layer.succeed(SignalRepository, signalRepository),
      fakeAi.layer,
      createPassthroughSqlClient(),
    )

    const result = await Effect.runPromise(
      removeScoreFromSignalUseCase({
        organizationId,
        projectId,
        signalId,
        draftedAt: null,
        feedback: "The assistant leaks API tokens.",
        sourceType: "annotation",
        createdAt: new Date("2026-03-30T10:00:00.000Z"),
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ action: "issue-not-found" })
  })

  it("removes score contribution from signal centroid", async () => {
    const scoreCreatedAt = new Date("2026-03-30T10:00:00.000Z")
    const embedding = makeEmbedding()

    const signalWithCentroid = makeSignal({
      centroid: updateSignalCentroid({
        centroid: {
          ...createSignalCentroid(),
          clusteredAt: new Date("2026-03-29T10:00:00.000Z"),
        },
        score: {
          embedding,
          sourceType: "annotation",
          createdAt: scoreCreatedAt,
        },
        operation: "add",
        timestamp: new Date("2026-03-30T10:00:00.000Z"),
      }),
    })

    const { repository: signalRepository, issues } = createFakeSignalRepository()
    issues.set(signalWithCentroid.id, signalWithCentroid)

    const fakeAi = createFakeAI({ embed: () => Effect.succeed({ embedding }) })

    const layer = Layer.mergeAll(
      Layer.succeed(SignalRepository, signalRepository),
      fakeAi.layer,
      createPassthroughSqlClient(),
    )

    expect(signalWithCentroid.centroid.mass).toBeGreaterThan(0)

    const result = await Effect.runPromise(
      removeScoreFromSignalUseCase({
        organizationId,
        projectId,
        signalId,
        draftedAt: null,
        feedback: "The assistant leaks API tokens.",
        sourceType: "annotation",
        createdAt: scoreCreatedAt,
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ action: "removed" })
    expect(fakeAi.calls.embed).toHaveLength(1)

    const updatedSignal = issues.get(signalId)
    expect(updatedSignal?.centroid.mass).toBe(0)
  })

  it("keeps remaining centroid mass positive after removing one contribution", async () => {
    const scoreCreatedAt1 = new Date("2026-03-30T08:00:00.000Z")
    const scoreCreatedAt2 = new Date("2026-03-30T10:00:00.000Z")
    const embedding1 = makeEmbedding()
    const embedding2 = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 2 ? 1 : 0))

    let centroid = updateSignalCentroid({
      centroid: { ...createSignalCentroid(), clusteredAt: new Date("2026-03-29T10:00:00.000Z") },
      score: { embedding: embedding1, sourceType: "annotation", createdAt: scoreCreatedAt1 },
      operation: "add",
      timestamp: scoreCreatedAt1,
    })
    centroid = updateSignalCentroid({
      centroid,
      score: { embedding: embedding2, sourceType: "annotation", createdAt: scoreCreatedAt2 },
      operation: "add",
      timestamp: scoreCreatedAt2,
    })

    const signalWithTwoScores = makeSignal({ centroid })
    const { repository: signalRepository, issues } = createFakeSignalRepository()
    issues.set(signalWithTwoScores.id, signalWithTwoScores)

    const fakeAi = createFakeAI({ embed: () => Effect.succeed({ embedding: embedding1 }) })

    const layer = Layer.mergeAll(
      Layer.succeed(SignalRepository, signalRepository),
      fakeAi.layer,
      createPassthroughSqlClient(),
    )

    const result = await Effect.runPromise(
      removeScoreFromSignalUseCase({
        organizationId,
        projectId,
        signalId,
        draftedAt: null,
        feedback: "First feedback",
        sourceType: "annotation",
        createdAt: scoreCreatedAt1,
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ action: "removed" })

    const updatedSignal = issues.get(signalId)
    expect(updatedSignal?.centroid.mass).toBeGreaterThan(0)
  })
})
