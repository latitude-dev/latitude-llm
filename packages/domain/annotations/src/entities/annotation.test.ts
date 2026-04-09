import { describe, expect, it } from "vitest"
import { annotationAnchorSchema, annotationSchema } from "../index.ts"

const cuid = "a".repeat(24)
const otherCuid = "b".repeat(24)
const traceId = "d".repeat(32)
const spanId = "e".repeat(16)

function buildAnnotationInput() {
  return {
    id: cuid,
    organizationId: cuid,
    projectId: otherCuid,
    sessionId: "session-1",
    traceId,
    spanId,
    simulationId: null,
    issueId: null,
    source: "annotation" as const,
    sourceId: "API",
    value: 0.92,
    passed: true,
    feedback: "The full conversation handled the request correctly.",
    metadata: {
      rawFeedback: "This conversation is correct and grounded.",
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-24T00:00:00.000Z"),
    updatedAt: new Date("2026-03-24T00:00:00.000Z"),
  }
}

describe("annotationSchema", () => {
  it("treats annotations as canonical annotation-backed scores", () => {
    const result = annotationSchema.safeParse(buildAnnotationInput())

    expect(result.success).toBe(true)
  })
})

describe("annotationAnchorSchema", () => {
  it("accepts message-level anchors", () => {
    const result = annotationAnchorSchema.safeParse({
      messageIndex: 2,
    })

    expect(result.success).toBe(true)
  })

  it("rejects substring anchors without a part index", () => {
    const result = annotationAnchorSchema.safeParse({
      messageIndex: 2,
      startOffset: 1,
      endOffset: 4,
    })

    expect(result.success).toBe(false)
  })
})
