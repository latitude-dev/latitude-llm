import type { AICredentialError, AIError, GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { type Score, ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import {
  ChSqlClient,
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  ScoreId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { TraceDetail } from "@domain/spans"
import { SpanRepository, TraceRepository } from "@domain/spans"
import { createFakeSpanRepository, createFakeTraceRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import {
  enrichAnnotationForPublicationUseCase,
  formatGenAIMessagesForEnrichmentPrompt,
} from "./enrich-annotation-for-publication.ts"

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

function createEnrichLayers(initialScore?: Score, generateOverride?: AIGenerate, traceDetail?: TraceDetail | null) {
  const { repository: scoreRepository, scores } = createFakeScoreRepository()
  if (initialScore) scores.set(initialScore.id, initialScore)

  const traceDetailForLookup = traceDetail === undefined ? makeTraceDetail([]) : traceDetail
  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => {
      if (traceDetailForLookup === null) {
        return Effect.fail(new NotFoundError({ entity: "Trace", id: "" }))
      }
      return Effect.succeed(traceDetailForLookup)
    },
  })

  const { repository: spanRepository } = createFakeSpanRepository({
    listByTraceId: () => Effect.succeed([publishDefaultCompletionSpan]),
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

  const { layer: aiLayer } = createFakeAI({ generate })

  return {
    scores,
    layer: Layer.mergeAll(
      Layer.succeed(ScoreRepository, scoreRepository),
      aiLayer,
      Layer.succeed(TraceRepository, traceRepository),
      Layer.succeed(SpanRepository, spanRepository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid) })),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(cuid) })),
    ),
  }
}

describe("enrichAnnotationForPublicationUseCase", () => {
  it("returns enriched feedback and resolved session/span ids", async () => {
    const draft = buildDraftAnnotationScore()
    const { layer } = createEnrichLayers(draft)

    const result = await Effect.runPromise(
      enrichAnnotationForPublicationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)),
    )

    expect(result.status).toBe("enriched")
    if (result.status !== "enriched") throw new Error("expected enriched")
    expect(result.enrichedFeedback).toBe("Enriched: The model hallucinated a date")
    expect(result.resolvedSessionId).toBe("session")
    expect(result.resolvedSpanId).toBe(String(publishResolvedSpanId))
  })

  it("returns already-published when draftedAt is cleared", async () => {
    const published = { ...buildDraftAnnotationScore(), draftedAt: null } as Score
    const { layer } = createEnrichLayers(published)

    const result = await Effect.runPromise(
      enrichAnnotationForPublicationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ status: "already-published" })
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
    const { layer } = createEnrichLayers(
      draft,
      <T>(input: GenerateInput<T>) => {
        capturedPrompt = input.prompt
        return Effect.succeed({
          object: { reasoning: "test", enrichedFeedback: "Enriched" } as T,
          tokens: 15,
          duration: 50_000_000,
        } as GenerateResult<T>)
      },
      makeTraceDetail(allMessages),
    )

    await Effect.runPromise(enrichAnnotationForPublicationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

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
    const { layer } = createEnrichLayers(
      draft,
      <T>(input: GenerateInput<T>) => {
        capturedPrompt = input.prompt
        return Effect.succeed({
          object: { reasoning: "test", enrichedFeedback: "Enriched" } as T,
          tokens: 15,
          duration: 50_000_000,
        } as GenerateResult<T>)
      },
      makeTraceDetail(allMessages),
    )

    await Effect.runPromise(enrichAnnotationForPublicationUseCase({ scoreId: scoreCuid }).pipe(Effect.provide(layer)))

    expect(capturedPrompt).toContain("Full conversation")
    expect(capturedPrompt).toContain("Summarize this doc")
    expect(capturedPrompt).toContain("Here is a short summary.")
    expect(capturedPrompt).not.toContain("Highlighted text")
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
