import { Effect } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import {
  createTestLayers,
  cuid,
  makeTraceDetail,
  projectCuid,
  queueId,
  traceIdRaw,
} from "../testing/persist-draft-annotation-test-layers.ts"
import { writeAnnotation } from "./write-annotation.ts"

const draftedAt = new Date("2026-04-16T12:00:00.000Z")

const baseInput = {
  projectId: projectCuid,
  sourceId: queueId,
  traceId: traceIdRaw,
  value: 0,
  passed: false,
  feedback: "Initial feedback",
  organizationId: cuid,
}

describe("writeAnnotation", () => {
  it("persists anchor metadata for a new annotation from flat fields", async () => {
    const { layer } = createTestLayers()

    const score = await Effect.runPromise(
      writeAnnotation(
        {
          ...baseInput,
          feedback: "Issue with refund policy",
          messageIndex: 2,
          partIndex: 0,
          startOffset: 10,
          endOffset: 25,
        },
        draftedAt,
      ).pipe(Effect.provide(layer)),
    )

    expect(score.metadata.messageIndex).toBe(2)
    expect(score.metadata.partIndex).toBe(0)
    expect(score.metadata.startOffset).toBe(10)
    expect(score.metadata.endOffset).toBe(25)
    expect(score.metadata.rawFeedback).toBe("Issue with refund policy")
  })

  it("when updating by id, ignores conflicting anchor and flat fields and preserves stored anchor metadata", async () => {
    const sliceSource = "The refund policy says no returns after 30 days."
    const allMessages: GenAIMessage[] = [
      { role: "user", parts: [{ type: "text", content: "hi" }] },
      { role: "assistant", parts: [{ type: "text", content: "hello" }] },
      { role: "assistant", parts: [{ type: "text", content: sliceSource }] },
    ]
    const { layer } = createTestLayers({ traceDetail: makeTraceDetail(allMessages) })

    const first = await Effect.runPromise(
      writeAnnotation(
        {
          ...baseInput,
          feedback: "Issue with refund policy",
          messageIndex: 2,
          partIndex: 0,
          startOffset: 10,
          endOffset: 25,
        },
        draftedAt,
      ).pipe(Effect.provide(layer)),
    )

    const updated = await Effect.runPromise(
      writeAnnotation(
        {
          ...baseInput,
          id: first.id,
          value: 1,
          passed: true,
          feedback: "Updated comment only",
          messageIndex: 0,
          partIndex: 0,
          startOffset: 1,
          endOffset: 2,
          anchor: {
            messageIndex: 0,
            partIndex: 0,
            startOffset: 1,
            endOffset: 2,
          },
        },
        draftedAt,
      ).pipe(Effect.provide(layer)),
    )

    expect(updated.metadata.messageIndex).toBe(2)
    expect(updated.metadata.partIndex).toBe(0)
    expect(updated.metadata.startOffset).toBe(10)
    expect(updated.metadata.endOffset).toBe(25)
    expect(updated.metadata.rawFeedback).toBe("Updated comment only")
    expect(updated.passed).toBe(true)
  })
})
