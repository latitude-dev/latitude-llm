import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { SCORE_PUBLICATION_DEBOUNCE, ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  OutboxEventWriter,
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
import { writeAnnotationUseCase } from "./write-annotation.ts"

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
  const { publisher, published } = createFakeQueuePublisher()
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

  const QueuePublisherTest = Layer.succeed(QueuePublisher, publisher)

  const SqlClientTest = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid) }))

  const TraceRepositoryTest = Layer.succeed(TraceRepository, traceRepository)
  const SpanRepositoryTest = Layer.succeed(SpanRepository, spanRepository)

  return {
    store,
    events,
    published,
    layer: Layer.mergeAll(
      ScoreRepositoryTest,
      ScoreAnalyticsRepositoryTest,
      OutboxEventWriterTest,
      QueuePublisherTest,
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
      writeAnnotationUseCase({
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
    expect(score.draftedAt).toBeInstanceOf(Date)
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
      writeAnnotationUseCase({
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
        writeAnnotationUseCase({
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
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "API",
        traceId: traceIdRaw,
        value: 0.8,
        passed: true,
        feedback: "Good response",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.sourceId).toBe("API")
    expect(score.draftedAt).not.toBeNull()
  })

  it("creates annotation with anchor metadata and validates anchor against trace messages (does not persist excerpt)", async () => {
    const sliceSource = "The refund policy says no returns after 30 days."
    const allMessages: GenAIMessage[] = [
      { role: "user", parts: [{ type: "text", content: "hi" }] },
      { role: "assistant", parts: [{ type: "text", content: "hello" }] },
      { role: "assistant", parts: [{ type: "text", content: sliceSource }] },
    ]
    const { layer } = createTestLayers({ traceDetail: makeTraceDetail(allMessages) })

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
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
      writeAnnotationUseCase({
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
        writeAnnotationUseCase({
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

    // partIndex without messageIndex should fail
    await expect(
      Effect.runPromise(
        writeAnnotationUseCase({
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

    // startOffset without endOffset should fail
    await expect(
      Effect.runPromise(
        writeAnnotationUseCase({
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

    // startOffset > endOffset should fail
    await expect(
      Effect.runPromise(
        writeAnnotationUseCase({
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

  it("updates a draft annotation with same id", async () => {
    const { store, layer } = createTestLayers()

    const first = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.3,
        passed: false,
        feedback: "Initial feedback",
      }).pipe(Effect.provide(layer)),
    )

    const updated = await Effect.runPromise(
      writeAnnotationUseCase({
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
    expect(store.size).toBe(1)
  })

  it("does not emit issue events for drafts", async () => {
    const { events, layer } = createTestLayers()

    await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.5,
        passed: true,
        feedback: "All good",
      }).pipe(Effect.provide(layer)),
    )

    // Drafts are never immutable — draftedAt is always set
    expect(events.length).toBe(0)
  })

  it("persists a preselected issue on UI drafts as intent only", async () => {
    const { events, store, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        issueId: "i".repeat(24),
        value: 0.1,
        passed: false,
        feedback: "Manual draft linked to an issue",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.issueId).toBe("i".repeat(24))
    expect(score.draftedAt).not.toBeNull()
    expect(store.get(score.id)?.issueId).toBe("i".repeat(24))
    expect(events).toHaveLength(0)
  })

  it("persists a preselected issue on API drafts as intent only", async () => {
    const { events, store, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "API",
        traceId: traceIdRaw,
        issueId: "j".repeat(24),
        value: 0.1,
        passed: false,
        feedback: "API draft linked to an issue",
      }).pipe(Effect.provide(layer)),
    )

    expect(score.issueId).toBe("j".repeat(24))
    expect(score.draftedAt).not.toBeNull()
    expect(store.get(score.id)?.issueId).toBe("j".repeat(24))
    expect(events).toHaveLength(0)
  })

  it("publishes debounced annotation-scores:publish after write", async () => {
    const { published, layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: projectCuid,
        sourceId: "UI",
        traceId: traceIdRaw,
        value: 0.2,
        passed: false,
        feedback: "Needs enrichment later",
      }).pipe(Effect.provide(layer)),
    )

    expect(published).toEqual([
      expect.objectContaining({
        queue: "annotation-scores",
        task: "publish",
        payload: {
          organizationId: cuid,
          projectId: projectCuid,
          scoreId: score.id,
        },
        options: expect.objectContaining({
          dedupeKey: `annotation-scores:publish:${score.id}`,
          debounceMs: SCORE_PUBLICATION_DEBOUNCE,
        }),
      }),
    ])
  })
})
