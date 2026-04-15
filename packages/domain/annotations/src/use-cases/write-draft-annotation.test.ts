import { SessionId, SpanId } from "@domain/shared"
import { Effect } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import {
  createTestLayers,
  cuid,
  defaultResolvedSpanId,
  makeTraceDetail,
  projectCuid,
  queueId,
  traceIdRaw,
} from "../testing/persist-draft-annotation-test-layers.ts"
import { writeDraftAnnotationUseCase } from "./write-draft-annotation.ts"

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
        eventName: "ScoreDraftSaved",
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

  it("writes ScoreDraftSaved for draft persistence", async () => {
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
        eventName: "ScoreDraftSaved",
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
    expect(events.filter((e: unknown) => (e as { eventName: string }).eventName === "ScoreDraftSaved")).toHaveLength(2)
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
    expect(events.filter((e: unknown) => (e as { eventName: string }).eventName === "ScoreDraftSaved")).toHaveLength(1)
  })
})
