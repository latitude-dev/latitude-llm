import type { AICredentialError, AIError, GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { type Score, ScoreAnalyticsRepository, type ScoreListPage, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import {
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  OutboxEventWriter,
  ProjectId,
  RepositoryError,
  ScoreId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import type { TraceDetail } from "@domain/spans"
import { SpanRepository, TraceRepository } from "@domain/spans"
import { createFakeSpanRepository, createFakeTraceRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { formatGenAIMessagesForEnrichmentPrompt, publishAnnotationUseCase } from "./publish-annotation.ts"

const cuid = "a".repeat(24)
const scoreCuid = ScoreId("s".repeat(24))
const projectCuid = "b".repeat(24)
const traceIdRaw = "d".repeat(32)
const traceId = TraceId(traceIdRaw)
const publishResolvedSpanId = SpanId("s".repeat(16))

const publishDefaultCompletionSpan = stubListSpan({
  organizationId: OrganizationId(cuid),
  projectId: ProjectId(projectCuid),
  traceId,
  sessionId: SessionId("session"),
  spanId: publishResolvedSpanId,
  operation: "chat",
  startTime: new Date("2026-03-24T00:00:00.000Z"),
  endTime: new Date("2026-03-24T00:01:00.000Z"),
})

function makeTraceDetail(allMessages: readonly GenAIMessage[]): TraceDetail {
  return {
    organizationId: OrganizationId(cuid),
    projectId: ProjectId(projectCuid),
    traceId,
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-03-24T00:00:00.000Z"),
    endTime: new Date("2026-03-24T00:00:00.000Z"),
    durationNs: 0,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    sessionId: SessionId("session"),
    userId: ExternalUserId("user"),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: [],
    inputMessages: [],
    outputMessages: [],
    allMessages: [...allMessages],
  }
}

function buildDraftAnnotationScore(): Score {
  return {
    id: scoreCuid,
    organizationId: cuid,
    projectId: projectCuid,
    sessionId: null,
    traceId: traceIdRaw,
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

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>, AIError | AICredentialError>

function createTestLayers(initialScore?: Score, generateOverride?: AIGenerate, traceDetail?: TraceDetail | null) {
  const store = new Map<string, Score>()
  if (initialScore) store.set(initialScore.id, initialScore)

  const events: unknown[] = []
  let lastSavedScore: Score | null = null

  const traceDetailForLookup = traceDetail === undefined ? makeTraceDetail([]) : traceDetail
  const { repository: scoreAnalyticsRepository, inserted } = createFakeScoreAnalyticsRepository()

  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => Effect.succeed(traceDetailForLookup),
  })

  const { repository: spanRepository } = createFakeSpanRepository({
    findByTraceId: () => Effect.succeed([publishDefaultCompletionSpan]),
  })

  const defaultGenerate: AIGenerate = <T>(input: GenerateInput<T>) =>
    Effect.succeed({
      object: {
        reasoning: "Mapped raw complaint to a pattern label.",
        enrichedFeedback: `Enriched: ${input.prompt.match(/Human feedback:\n(.+?)(?:\n\n|$)/)?.[1] ?? ""}`,
      } as T,
      tokens: 15,
      duration: 50_000_000,
    } as GenerateResult<T>)

  const generate = generateOverride ?? defaultGenerate

  const ScoreRepositoryTest = Layer.succeed(ScoreRepository, {
    findById: (id) => {
      const score = store.get(id)
      if (!score) {
        return Effect.fail(new NotFoundError({ entity: "Score", id }))
      }
      return Effect.succeed(score)
    },
    save: (score) =>
      Effect.sync(() => {
        store.set(score.id, score)
        lastSavedScore = score
      }),
    assignIssueIfUnowned: ({ scoreId, issueId, updatedAt }) =>
      Effect.sync(() => {
        const score = store.get(scoreId)
        if (!score || score.issueId !== null) {
          return false
        }

        store.set(scoreId, {
          ...score,
          issueId,
          updatedAt,
        })
        return true
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

  const { layer: aiLayer } = createFakeAI({
    generate,
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

  const TraceRepositoryTest = Layer.succeed(TraceRepository, traceRepository)
  const SpanRepositoryTest = Layer.succeed(SpanRepository, spanRepository)

  return {
    store,
    events,
    insertedAnalytics: inserted,
    getLastSavedScore: () => lastSavedScore,
    layer: Layer.mergeAll(
      ScoreRepositoryTest,
      Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
      OutboxEventWriterTest,
      aiLayer,
      SqlClientTest,
      TraceRepositoryTest,
      SpanRepositoryTest,
    ),
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
    expect(result.tokens).toBe(0)
    expect(result.duration).toBe(0)
    expect(result.cost).toBe(0)

    const storedScore = store.get(scoreCuid)
    expect(storedScore).toBeDefined()
    expect(storedScore?.draftedAt).toBeNull()
    expect(storedScore?.sessionId).toBe(SessionId("session"))
    expect(storedScore?.spanId).toBe(publishResolvedSpanId)
  })

  it("builds enrichment prompt from trace re-resolved anchor text, not coordinate indices", async () => {
    const partText = "prefixMarch 2025"
    const allMessages: GenAIMessage[] = [{ role: "assistant", parts: [{ type: "text", content: partText }] }]
    const draft = {
      ...buildDraftAnnotationScore(),
      metadata: {
        rawFeedback: "The model hallucinated a date",
        messageIndex: 0,
        partIndex: 0,
        startOffset: 6,
        endOffset: 16,
      },
    } as Score

    let capturedPrompt = ""
    const { layer } = createTestLayers(
      draft,
      <T>(input: GenerateInput<T>) => {
        capturedPrompt = input.prompt
        return Effect.succeed({
          object: {
            reasoning: "test",
            enrichedFeedback: "Enriched",
          } as T,
          tokens: 15,
          duration: 50_000_000,
        } as GenerateResult<T>)
      },
      makeTraceDetail(allMessages),
    )

    await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(capturedPrompt).toContain("Full conversation")
    expect(capturedPrompt).toContain("[message 0]")
    expect(capturedPrompt).toContain("prefixMarch 2025")
    expect(capturedPrompt).toContain("March 2025")
    expect(capturedPrompt).toContain("Highlighted text")
    expect(capturedPrompt).toContain("Human feedback")
    expect(capturedPrompt).not.toContain("messageIndex")
    expect(capturedPrompt).not.toContain("partIndex")
    expect(capturedPrompt).not.toContain("startOffset")
    expect(capturedPrompt).not.toContain("endOffset")
  })

  it("includes full conversation but no highlighted excerpt for conversation-level annotations", async () => {
    const allMessages: GenAIMessage[] = [
      { role: "user", parts: [{ type: "text", content: "Summarize this doc" }] },
      { role: "assistant", parts: [{ type: "text", content: "Here is a short summary." }] },
    ]
    const draft = {
      ...buildDraftAnnotationScore(),
      metadata: {
        rawFeedback: "The whole reply missed the point",
      },
    } as Score

    let capturedPrompt = ""
    const { layer } = createTestLayers(
      draft,
      <T>(input: GenerateInput<T>) => {
        capturedPrompt = input.prompt
        return Effect.succeed({
          object: {
            reasoning: "test",
            enrichedFeedback: "Enriched",
          } as T,
          tokens: 15,
          duration: 50_000_000,
        } as GenerateResult<T>)
      },
      makeTraceDetail(allMessages),
    )

    await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(capturedPrompt).toContain("Full conversation")
    expect(capturedPrompt).toContain("Summarize this doc")
    expect(capturedPrompt).toContain("Here is a short summary.")
    expect(capturedPrompt).not.toContain("Highlighted text")
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

  it("emits IssueDiscoveryRequested for failed non-errored annotations without issue", async () => {
    const draft = buildDraftAnnotationScore()
    const { events, layer } = createTestLayers(draft)

    await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(events).toEqual([
      expect.objectContaining({
        eventName: "IssueDiscoveryRequested",
        payload: expect.objectContaining({
          organizationId: cuid,
          projectId: projectCuid,
          scoreId: scoreCuid,
        }),
      }),
    ])
  })

  it("syncs analytics directly for passed annotations", async () => {
    const draft = {
      ...buildDraftAnnotationScore(),
      value: 0.8,
      passed: true,
    } as Score
    const { events, insertedAnalytics, layer } = createTestLayers(draft)

    await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(events).toHaveLength(0)
    expect(insertedAnalytics).toEqual([scoreCuid])
  })

  it("publishes IssueRefreshRequested and syncs analytics for immutable annotations already linked to an issue", async () => {
    const draft = {
      ...buildDraftAnnotationScore(),
      issueId: "i".repeat(24),
    } as Score
    const { events, insertedAnalytics, layer } = createTestLayers(draft)

    await Effect.runPromise(publishAnnotationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(events).toEqual([
      expect.objectContaining({
        eventName: "IssueRefreshRequested",
        payload: expect.objectContaining({
          projectId: projectCuid,
          issueId: "i".repeat(24),
        }),
      }),
    ])
    expect(insertedAnalytics).toEqual([scoreCuid])
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

describe("formatGenAIMessagesForEnrichmentPrompt", () => {
  it("includes message indices and separators", () => {
    const out = formatGenAIMessagesForEnrichmentPrompt([
      { role: "user", parts: [{ type: "text", content: "u" }] },
      { role: "assistant", parts: [{ type: "text", content: "a" }] },
    ])
    expect(out).toContain("[message 0] role=user")
    expect(out).toContain("[message 1] role=assistant")
    expect(out).toContain("\n\n---\n\n")
  })
})
