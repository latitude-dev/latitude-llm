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
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import type { Span, TraceDetail } from "@domain/spans"
import { SpanRepository, TraceRepository } from "@domain/spans"
import { createFakeSpanRepository, createFakeTraceRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { writeDraftAnnotationUseCase } from "./write-draft-annotation.ts"

const cuid = "a".repeat(24)
const projectCuid = "b".repeat(24)
const traceIdRaw = "d".repeat(32)
const traceId = TraceId(traceIdRaw)
const defaultResolvedSpanId = SpanId("s".repeat(16))
const queueId = "q".repeat(24)

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

describe("persistDraftAnnotation", () => {
  it("creates a draft annotation score without auto-publishing", async () => {
    const { store, events, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeDraftAnnotationUseCase({
        projectId: projectCuid,
        sourceId: queueId,
        traceId: traceIdRaw,
        value: 0,
        passed: false,
        feedback: "AI-generated feedback for system queue draft",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(score.source).toBe("annotation")
    expect(score.sourceId).toBe(queueId)
    expect(score.draftedAt).toBeInstanceOf(Date)
    expect(score.feedback).toBe("AI-generated feedback for system queue draft")
    expect(score.metadata.rawFeedback).toBe("AI-generated feedback for system queue draft")
    expect(score.value).toBe(0)
    expect(score.passed).toBe(false)
    expect(store.size).toBe(1)
    expect(score.sessionId).toBe(SessionId("session"))
    expect(score.spanId).toBe(defaultResolvedSpanId)

    expect(events).toEqual([
      expect.objectContaining({
        eventName: "ScoreCreated",
        payload: expect.objectContaining({
          organizationId: cuid,
          projectId: projectCuid,
          scoreId: score.id,
        }),
      }),
    ])
  })

  it("resolves trace context when not provided", async () => {
    const { layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeDraftAnnotationUseCase({
        projectId: projectCuid,
        sourceId: queueId,
        traceId: traceIdRaw,
        sessionId: null,
        spanId: null,
        value: 0,
        passed: false,
        feedback: "Draft with resolved context",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(score.sessionId).toBe(SessionId("session"))
    expect(score.spanId).toBe(defaultResolvedSpanId)
  })

  it("uses provided trace context when available", async () => {
    const { layer } = createTestLayers()
    const providedSessionId = SessionId("provided-session")
    const providedSpanId = SpanId("p".repeat(16))

    const score = await Effect.runPromise(
      writeDraftAnnotationUseCase({
        projectId: projectCuid,
        sourceId: queueId,
        traceId: traceIdRaw,
        sessionId: providedSessionId,
        spanId: providedSpanId,
        value: 0,
        passed: false,
        feedback: "Draft with provided context",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(score.sessionId).toBe(providedSessionId)
    expect(score.spanId).toBe(providedSpanId)
  })

  it("creates draft with anchor metadata", async () => {
    const sliceSource = "The refund policy says no returns after 30 days."
    const allMessages: GenAIMessage[] = [
      { role: "user", parts: [{ type: "text", content: "hi" }] },
      { role: "assistant", parts: [{ type: "text", content: "hello" }] },
      { role: "assistant", parts: [{ type: "text", content: sliceSource }] },
    ]
    const { layer } = createTestLayers({ traceDetail: makeTraceDetail(allMessages) })

    const score = await Effect.runPromise(
      writeDraftAnnotationUseCase({
        projectId: projectCuid,
        sourceId: queueId,
        traceId: traceIdRaw,
        value: 0,
        passed: false,
        feedback: "Issue with refund policy",
        messageIndex: 2,
        partIndex: 0,
        startOffset: 10,
        endOffset: 25,
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(score.metadata.messageIndex).toBe(2)
    expect(score.metadata.partIndex).toBe(0)
    expect(score.metadata.startOffset).toBe(10)
    expect(score.metadata.endOffset).toBe(25)
    expect(score.metadata.rawFeedback).toBe("Issue with refund policy")
  })

  it("writes ScoreCreated for draft persistence", async () => {
    const { events, layer } = createTestLayers()

    await Effect.runPromise(
      writeDraftAnnotationUseCase({
        projectId: projectCuid,
        sourceId: queueId,
        traceId: traceIdRaw,
        value: 0,
        passed: false,
        feedback: "Draft without publication",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(events).toEqual([
      expect.objectContaining({
        eventName: "ScoreCreated",
        payload: expect.objectContaining({
          organizationId: cuid,
          projectId: projectCuid,
          issueId: null,
        }),
      }),
    ])
  })

  it("updates existing draft when id is provided", async () => {
    const { store, events, layer } = createTestLayers()

    const first = await Effect.runPromise(
      writeDraftAnnotationUseCase({
        projectId: projectCuid,
        sourceId: queueId,
        traceId: traceIdRaw,
        value: 0,
        passed: false,
        feedback: "Initial AI feedback",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    const updated = await Effect.runPromise(
      writeDraftAnnotationUseCase({
        id: first.id,
        projectId: projectCuid,
        sourceId: queueId,
        traceId: traceIdRaw,
        value: 0,
        passed: false,
        feedback: "Updated AI feedback",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.id).toBe(first.id)
    expect(updated.feedback).toBe("Updated AI feedback")
    expect(updated.metadata.rawFeedback).toBe("Updated AI feedback")
    expect(store.size).toBe(1)
    expect(events.filter((e: unknown) => (e as { eventName: string }).eventName === "ScoreCreated")).toHaveLength(2)
  })

  it("supports queue-backed drafts with source=annotation and queue sourceId", async () => {
    const { store, events, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeDraftAnnotationUseCase({
        projectId: projectCuid,
        sourceId: queueId,
        traceId: traceIdRaw,
        value: 0,
        passed: false,
        feedback: "Queue-generated draft feedback",
        organizationId: cuid,
      }).pipe(Effect.provide(layer)),
    )

    expect(score.source).toBe("annotation")
    expect(score.sourceId).toBe(queueId)
    expect(score.draftedAt).not.toBeNull()
    expect(store.size).toBe(1)
    expect(events.filter((e: unknown) => (e as { eventName: string }).eventName === "ScoreCreated")).toHaveLength(1)
  })
})
