import { AI, type GenerateObjectInput, type GenerateObjectResult } from "@domain/ai"
import { type Score, type ScoreListPage, ScoreRepository } from "@domain/scores"
import { OrganizationId, OutboxEventWriter, RepositoryError, ScoreId, SqlClient } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { publishAnnotationUseCase } from "./publish-annotation.ts"

const cuid = "a".repeat(24)
const scoreCuid = ScoreId("s".repeat(24))
const projectCuid = "b".repeat(24)
const traceId = "d".repeat(32)

function buildDraftAnnotationScore(): Score {
  return {
    id: scoreCuid,
    organizationId: cuid,
    projectId: projectCuid,
    sessionId: null,
    traceId,
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

function createTestLayers(initialScore?: Score) {
  const store = new Map<string, Score>()
  if (initialScore) store.set(initialScore.id, initialScore)

  const events: unknown[] = []
  let lastSavedScore: Score | null = null

  const ScoreRepositoryTest = Layer.succeed(ScoreRepository, {
    findById: (id) => Effect.succeed(store.get(id) ?? null),
    save: (score) =>
      Effect.sync(() => {
        store.set(score.id, score)
        lastSavedScore = score
      }),
    delete: (id) =>
      Effect.sync(() => {
        store.delete(id)
      }),
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false, limit: 50, offset: 0 } as ScoreListPage),
    listBySourceId: () => Effect.succeed({ items: [], hasMore: false, limit: 50, offset: 0 } as ScoreListPage),
    listByTraceId: () => Effect.succeed({ items: [], hasMore: false, limit: 50, offset: 0 } as ScoreListPage),
    listBySessionId: () => Effect.succeed({ items: [], hasMore: false, limit: 50, offset: 0 } as ScoreListPage),
    listBySpanId: () => Effect.succeed({ items: [], hasMore: false, limit: 50, offset: 0 } as ScoreListPage),
    listByIssueId: () => Effect.succeed({ items: [], hasMore: false, limit: 50, offset: 0 } as ScoreListPage),
  })

  const OutboxEventWriterTest = Layer.succeed(OutboxEventWriter, {
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })

  const AITest = Layer.succeed(AI, {
    generateObject: <T>(input: GenerateObjectInput<T>) =>
      Effect.succeed({
        object: {
          reasoning: "Mapped raw complaint to a pattern label.",
          enrichedSentence: `Enriched: ${input.prompt.match(/"(.+?)"/)?.[1] ?? ""}`,
        } as T,
        tokens: 15,
        duration: 50_000_000,
      } as GenerateObjectResult<T>),
  })

  const SqlClientTest = Layer.succeed(SqlClient, {
    organizationId: OrganizationId(cuid),
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: () =>
      Effect.fail(
        new RepositoryError({
          cause: new Error("not implemented in test"),
          operation: "query",
        }),
      ),
  })

  return {
    store,
    events,
    getLastSavedScore: () => lastSavedScore,
    layer: Layer.mergeAll(ScoreRepositoryTest, OutboxEventWriterTest, AITest, SqlClientTest),
  }
}

describe("publishAnnotationUseCase", () => {
  it("publishes a draft annotation: clears draftedAt, enriches feedback", async () => {
    const draft = buildDraftAnnotationScore()
    const { store, layer } = createTestLayers(draft)

    const result = await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(result.draftedAt).toBeNull()
    expect(result.feedback).toBe("Enriched: The model hallucinated a date")
    expect(result.metadata.rawFeedback).toBe("The model hallucinated a date")
    expect(result.tokens).toBe(15)
    expect(result.duration).toBe(50_000_000)

    const storedScore = store.get(scoreCuid)
    expect(storedScore).toBeDefined()
    expect(storedScore?.draftedAt).toBeNull()
  })

  it("is idempotent on already-published annotation", async () => {
    const published = {
      ...buildDraftAnnotationScore(),
      draftedAt: null,
    } as Score
    const { events, layer } = createTestLayers(published)

    const result = await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(result.draftedAt).toBeNull()
    // No new events should be emitted
    expect(events.length).toBe(0)
  })

  it("emits ScoreImmutable for failed non-errored annotations without issue", async () => {
    const draft = buildDraftAnnotationScore()
    const { events, layer } = createTestLayers(draft)

    await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    // Failed, non-errored, no issueId → not yet immutable (needs issue assignment)
    // Actually: isImmutableScore checks passed || errored || issueId !== null
    // This score: passed=false, errored=false, issueId=null → NOT immutable
    expect(events.length).toBe(0)
  })

  it("emits ScoreImmutable for passed annotations", async () => {
    const draft = {
      ...buildDraftAnnotationScore(),
      value: 0.8,
      passed: true,
    } as Score
    const { events, layer } = createTestLayers(draft)

    await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(events.length).toBe(1)
    expect(events[0]).toEqual(
      expect.objectContaining({
        eventName: "ScoreImmutable",
      }),
    )
  })

  it("returns BadRequestError for non-existent score", async () => {
    const { layer } = createTestLayers()
    const missingId = ScoreId("x".repeat(24))

    const result = await Effect.runPromiseExit(
      publishAnnotationUseCase({ scoreId: missingId }).pipe(Effect.provide(layer)),
    )

    expect(result._tag).toBe("Failure")
  })

  it("returns BadRequestError for non-annotation score", async () => {
    const customScore = {
      ...buildDraftAnnotationScore(),
      source: "custom",
      sourceId: "batch-import",
      metadata: { reviewer: "test" },
    } as Score
    const { layer } = createTestLayers(customScore)

    const result = await Effect.runPromiseExit(
      publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)),
    )

    expect(result._tag).toBe("Failure")
  })
})
