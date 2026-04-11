import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
  UserId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import type { Span, TraceDetail } from "@domain/spans"
import { SpanRepository, TraceRepository } from "@domain/spans"
import { createFakeSpanRepository, createFakeTraceRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { writePublishedAnnotationUseCase } from "./write-annotation.ts"
import { writeDraftAnnotation } from "./write-draft-annotation.ts"

const cuid = "a".repeat(24)
const projectCuid = "b".repeat(24)
const traceIdRaw = "d".repeat(32)
const traceId = TraceId(traceIdRaw)
const defaultResolvedSpanId = SpanId("s".repeat(16))

function defaultCompletionSpan(): Span {
  return stubListSpan({
    organizationId: OrganizationId(cuid),
    projectId: ProjectId(projectCuid),
    traceId,
    sessionId: SessionId("session"),
    spanId: defaultResolvedSpanId,
    operation: "chat",
    startTime: new Date("2026-03-24T00:00:00.000Z"),
    endTime: new Date("2026-03-24T00:01:00.000Z"),
  })
}

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

function createTestLayers(options?: { traceDetail?: TraceDetail | null; spansForTrace?: readonly Span[] }) {
  const events: unknown[] = []
  const { repository: scoreRepository, scores: store } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()

  const traceDetailForLookup =
    options === undefined || options.traceDetail === undefined ? makeTraceDetail([]) : options.traceDetail

  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => {
      if (traceDetailForLookup === null) {
        return Effect.fail(new NotFoundError({ entity: "Trace", id: "" }))
      }
      return Effect.succeed(traceDetailForLookup)
    },
  })

  const spans = options?.spansForTrace ?? [defaultCompletionSpan()]
  const { repository: spanRepository } = createFakeSpanRepository({
    listByTraceId: () => Effect.succeed([...spans]),
  })

  const ScoreRepositoryTest = Layer.succeed(ScoreRepository, scoreRepository)
  const ScoreAnalyticsRepositoryTest = Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository)

  const OutboxEventWriterTest = Layer.succeed(OutboxEventWriter, {
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })

  const SqlClientTest = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid) }))

  const TraceRepositoryTest = Layer.succeed(TraceRepository, traceRepository)
  const SpanRepositoryTest = Layer.succeed(SpanRepository, spanRepository)

  return {
    store,
    events,
    layer: Layer.mergeAll(
      ScoreRepositoryTest,
      ScoreAnalyticsRepositoryTest,
      OutboxEventWriterTest,
      SqlClientTest,
      TraceRepositoryTest,
      SpanRepositoryTest,
    ),
  }
}

describe("writeAnnotationUseCase", () => {
  it("creates an annotation score with correct defaults", async () => {
    const { store, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.2,
        passed: false,
        feedback: "The model hallucinated a date",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.source).toBe("annotation")
    expect(score.sourceId).toBe("UI")
    expect(score.draftedAt).toBeNull()
    expect(score.feedback).toBe("The model hallucinated a date")
    expect(score.metadata.rawFeedback).toBe("The model hallucinated a date")
    expect(store.size).toBe(1)
    expect(score.sessionId).toBe(SessionId("session"))
    expect(score.spanId).toBe(defaultResolvedSpanId)
  })

  it("resolves the latest chat span when spanId is omitted", async () => {
    const older = stubListSpan({
      organizationId: OrganizationId(cuid),
      projectId: ProjectId(projectCuid),
      traceId,
      sessionId: SessionId("session"),
      spanId: SpanId("a".repeat(16)),
      operation: "chat",
      startTime: new Date("2026-03-24T00:00:00.000Z"),
      endTime: new Date("2026-03-24T00:00:01.000Z"),
    })
    const newer = stubListSpan({
      organizationId: OrganizationId(cuid),
      projectId: ProjectId(projectCuid),
      traceId,
      sessionId: SessionId("session"),
      spanId: SpanId("b".repeat(16)),
      operation: "chat",
      startTime: new Date("2026-03-24T00:00:02.000Z"),
      endTime: new Date("2026-03-24T00:00:05.000Z"),
    })
    const { layer } = createTestLayers({ spansForTrace: [older, newer] })

    const score = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.2,
        passed: false,
        feedback: "x",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.spanId).toBe(newer.spanId)
  })

  it("fails when trace has no LLM completion spans and spanId is omitted", async () => {
    const { layer } = createTestLayers({ spansForTrace: [] })

    await expect(
      Effect.runPromise(
        writePublishedAnnotationUseCase({
          projectId: projectCuid,
          sourceId: "UI",
          traceId: traceIdRaw,
          value: 0.1,
          passed: false,
          feedback: "x",
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow(/No LLM completion span/)
  })

  it("creates annotation with API source id", async () => {
    const { layer } = createTestLayers()

    const score = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "API",
        traceId: traceIdRaw,
        value: 0.8,
        passed: true,
        feedback: "Good response",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.sourceId).toBe("API")
    expect(score.draftedAt).toBeNull()
  })

  it("creates annotation with anchor metadata and validates anchor against trace messages", async () => {
    const sliceSource = "The refund policy says no returns after 30 days."
    const allMessages: GenAIMessage[] = [
      { role: "user", parts: [{ type: "text", content: "hi" }] },
      { role: "assistant", parts: [{ type: "text", content: "hello" }] },
      { role: "assistant", parts: [{ type: "text", content: sliceSource }] },
    ]
    const { layer } = createTestLayers({ traceDetail: makeTraceDetail(allMessages) })

    const score = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.1,
        passed: false,
        feedback: "Wrong claim here",
        anchor: {
          messageIndex: 2,
          partIndex: 0,
          startOffset: 10,
          endOffset: 25,
        },
      }).pipe(Effect.provide(layer)),
    )

    expect(score.metadata.messageIndex).toBe(2)
    expect(score.metadata.partIndex).toBe(0)
    expect(score.metadata.startOffset).toBe(10)
    expect(score.metadata.endOffset).toBe(25)
    expect(score.metadata.rawFeedback).toBe("Wrong claim here")
  })

  it("validates full part text when offsets are omitted without persisting excerpt", async () => {
    const excerpt = "The refund policy says no returns after 30 days."
    const allMessages: GenAIMessage[] = [
      { role: "user", parts: [{ type: "text", content: "x" }] },
      { role: "assistant", parts: [{ type: "text", content: "y" }] },
      { role: "assistant", parts: [{ type: "text", content: excerpt }] },
    ]
    const { layer } = createTestLayers({ traceDetail: makeTraceDetail(allMessages) })

    const score = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.1,
        passed: false,
        feedback: "Wrong claim here",
        anchor: { messageIndex: 2, partIndex: 0 },
      }).pipe(Effect.provide(layer)),
    )

    expect(score.metadata.messageIndex).toBe(2)
  })

  it("fails when trace cannot be loaded for a message anchor", async () => {
    const { layer } = createTestLayers({ traceDetail: null })

    await expect(
      Effect.runPromise(
        writePublishedAnnotationUseCase({
          projectId: projectCuid,
          sourceId: "UI",
          traceId: traceIdRaw,
          value: 0.1,
          passed: false,
          feedback: "x",
          anchor: { messageIndex: 0, partIndex: 0 },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow()
  })

  it("validates anchor field consistency", async () => {
    const { layer } = createTestLayers()

    await expect(
      Effect.runPromise(
        writePublishedAnnotationUseCase({
          projectId: projectCuid,
          sourceId: "UI",
          traceId: traceIdRaw,
          value: 0.1,
          passed: false,
          feedback: "Bad anchor",
          anchor: { partIndex: 0 },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow()

    await expect(
      Effect.runPromise(
        writePublishedAnnotationUseCase({
          projectId: projectCuid,
          sourceId: "UI",
          traceId: traceIdRaw,
          value: 0.1,
          passed: false,
          feedback: "Bad anchor",
          anchor: { messageIndex: 1, partIndex: 0, startOffset: 5 },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow()

    await expect(
      Effect.runPromise(
        writePublishedAnnotationUseCase({
          projectId: projectCuid,
          sourceId: "UI",
          traceId: traceIdRaw,
          value: 0.1,
          passed: false,
          feedback: "Bad anchor",
          anchor: { messageIndex: 1, partIndex: 0, startOffset: 20, endOffset: 5 },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow()
  })

  it("publishes and revises a draft when saving with the same id", async () => {
    const { store, layer } = createTestLayers()

    const first = await Effect.runPromise(
      writeDraftAnnotation({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.3,
        passed: false,
        feedback: "Initial feedback",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    const updated = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        id: first.id,
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.1,
        passed: false,
        feedback: "Revised feedback",
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.id).toBe(first.id)
    expect(updated.feedback).toBe("Revised feedback")
    expect(updated.metadata.rawFeedback).toBe("Revised feedback")
    expect(updated.draftedAt).toBeNull()
    expect(store.size).toBe(1)
  })

  it("preserves anchor when updating annotation without providing anchor", async () => {
    const allMessages: GenAIMessage[] = [
      { role: "user", parts: [{ type: "text", content: "hi" }] },
      { role: "assistant", parts: [{ type: "text", content: "hello world" }] },
    ]
    const { store, layer } = createTestLayers({ traceDetail: makeTraceDetail(allMessages) })

    const first = await Effect.runPromise(
      writeDraftAnnotation({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.3,
        passed: false,
        feedback: "Initial feedback",
        messageIndex: 1,
        partIndex: 0,
        startOffset: 0,
        endOffset: 5,
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(first.metadata.messageIndex).toBe(1)
    expect(first.metadata.partIndex).toBe(0)
    expect(first.metadata.startOffset).toBe(0)
    expect(first.metadata.endOffset).toBe(5)

    const updated = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        id: first.id,
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.1,
        passed: true,
        feedback: "Revised feedback",
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.id).toBe(first.id)
    expect(updated.feedback).toBe("Revised feedback")
    expect(updated.passed).toBe(true)
    expect(updated.metadata.messageIndex).toBe(1)
    expect(updated.metadata.partIndex).toBe(0)
    expect(updated.metadata.startOffset).toBe(0)
    expect(updated.metadata.endOffset).toBe(5)
    expect(updated.draftedAt).toBeNull()
    expect(store.size).toBe(1)
  })

  it("preserves message-level anchor when updating annotation without providing anchor", async () => {
    const allMessages: GenAIMessage[] = [
      { role: "user", parts: [{ type: "text", content: "hi" }] },
      { role: "assistant", parts: [{ type: "text", content: "hello" }] },
    ]
    const { store, layer } = createTestLayers({ traceDetail: makeTraceDetail(allMessages) })

    const first = await Effect.runPromise(
      writeDraftAnnotation({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.5,
        passed: true,
        feedback: "Good message",
        messageIndex: 1,
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(first.metadata.messageIndex).toBe(1)
    expect(first.metadata.partIndex).toBeUndefined()

    const updated = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        id: first.id,
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.2,
        passed: false,
        feedback: "Actually not good",
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.id).toBe(first.id)
    expect(updated.feedback).toBe("Actually not good")
    expect(updated.passed).toBe(false)
    expect(updated.metadata.messageIndex).toBe(1)
    expect(updated.draftedAt).toBeNull()
    expect(store.size).toBe(1)
  })

  it("writes ScoreCreated when persisting a published UI annotation", async () => {
    const { events, layer } = createTestLayers()

    await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.5,
        passed: true,
        feedback: "All good",
      }).pipe(Effect.provide(layer)),
    )

    const scoreCreatedEvents = events.filter((e: unknown) => (e as { eventName: string }).eventName === "ScoreCreated")
    expect(scoreCreatedEvents).toHaveLength(1)
  })

  it("persists a preselected issue on published UI annotations as intent only", async () => {
    const { events, store, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        issueId: "i".repeat(24),
        value: 0.1,
        passed: false,
        feedback: "Manual annotation linked to an issue",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.issueId).toBe("i".repeat(24))
    expect(score.draftedAt).toBeNull()
    expect(store.get(score.id)?.issueId).toBe("i".repeat(24))
    const scoreCreatedEvents = events.filter((e: unknown) => (e as { eventName: string }).eventName === "ScoreCreated")
    expect(scoreCreatedEvents).toHaveLength(1)
  })

  it("persists a preselected issue on published API annotations as intent only", async () => {
    const { events, store, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "API",
        traceId: traceIdRaw,
        issueId: "j".repeat(24),
        value: 0.1,
        passed: false,
        feedback: "API annotation linked to an issue",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.issueId).toBe("j".repeat(24))
    expect(score.draftedAt).toBeNull()
    expect(store.get(score.id)?.issueId).toBe("j".repeat(24))
    const scoreCreatedEvents = events.filter((e: unknown) => (e as { eventName: string }).eventName === "ScoreCreated")
    expect(scoreCreatedEvents).toHaveLength(1)
  })

  it("writes ScoreCreated after published annotation write", async () => {
    const { events, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.2,
        passed: false,
        feedback: "Published from UI",
      }).pipe(Effect.provide(layer)),
    )

    expect(events).toEqual([
      expect.objectContaining({
        eventName: "ScoreCreated",
        aggregateType: "score",
        aggregateId: score.id,
        organizationId: cuid,
        payload: {
          organizationId: cuid,
          projectId: projectCuid,
          scoreId: score.id,
          issueId: null,
        },
      }),
    ])
  })

  it("preserves original annotatorId when publishing a revision over a draft", async () => {
    const originalAnnotatorId = UserId("o".repeat(24))
    const differentUserId = UserId("d".repeat(24))
    const { store, layer } = createTestLayers()

    const first = await Effect.runPromise(
      writeDraftAnnotation({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        annotatorId: originalAnnotatorId,
        value: 0.3,
        passed: false,
        feedback: "Initial feedback",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(first.annotatorId).toBe(originalAnnotatorId)

    const updated = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        id: first.id,
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        annotatorId: differentUserId,
        value: 0.1,
        passed: true,
        feedback: "Revised by someone else",
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.id).toBe(first.id)
    expect(updated.feedback).toBe("Revised by someone else")
    expect(updated.annotatorId).toBe(originalAnnotatorId)
    expect(updated.draftedAt).toBeNull()
    expect(store.size).toBe(1)
  })

  it("preserves annotatorId when update omits it entirely", async () => {
    const originalAnnotatorId = UserId("o".repeat(24))
    const { layer } = createTestLayers()

    const first = await Effect.runPromise(
      writeDraftAnnotation({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        annotatorId: originalAnnotatorId,
        value: 0.5,
        passed: true,
        feedback: "Good response",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(first.annotatorId).toBe(originalAnnotatorId)

    const updated = await Effect.runPromise(
      writePublishedAnnotationUseCase({
        id: first.id,
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.2,
        passed: false,
        feedback: "Changed my mind",
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.annotatorId).toBe(originalAnnotatorId)
    expect(updated.draftedAt).toBeNull()
  })
})
