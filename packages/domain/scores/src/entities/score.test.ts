import { describe, expect, it } from "vitest"
import {
  annotationAnchorSchema,
  annotationScoreSchema,
  customScoreSchema,
  evaluationScoreSchema,
  SCORE_PUBLICATION_DEBOUNCE,
  scoreSchema,
} from "../index.ts"

const cuid = "a".repeat(24)
const otherCuid = "b".repeat(24)
const thirdCuid = "c".repeat(24)
const traceId = "d".repeat(32)
const spanId = "e".repeat(16)

function buildBaseScoreInput() {
  return {
    id: cuid,
    organizationId: cuid,
    projectId: otherCuid,
    sessionId: "session-1",
    traceId,
    spanId,
    simulationId: null,
    issueId: null,
    value: 0.75,
    passed: true,
    feedback: "Model followed the expected behavior.",
    error: null,
    errored: false,
    duration: 1_000_000,
    tokens: 42,
    cost: 1_000,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-24T00:00:00.000Z"),
    updatedAt: new Date("2026-03-24T00:00:00.000Z"),
  }
}

describe("scoreSchema", () => {
  it("parses a valid evaluation-backed score", () => {
    const result = evaluationScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "evaluation",
      sourceId: thirdCuid,
      metadata: { evaluationHash: "sha256:future-proof-hash" },
    })

    expect(result.success).toBe(true)
  })

  it("rejects a passed score with an error", () => {
    const result = scoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "evaluation",
      sourceId: thirdCuid,
      metadata: { evaluationHash: "sha256:future-proof-hash" },
      error: "execution failed",
      errored: true,
    })

    expect(result.success).toBe(false)
  })

  it("rejects mismatched errored and error fields", () => {
    const result = scoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "custom",
      sourceId: "manual-source",
      metadata: { reviewer: "user" },
      passed: false,
      error: "execution failed",
      errored: false,
    })

    expect(result.success).toBe(false)
  })
})

describe("annotationScoreSchema", () => {
  it("accepts a conversation-level anchor with no message coordinates", () => {
    const result = annotationAnchorSchema.safeParse({})

    expect(result.success).toBe(true)
  })

  it("accepts the UI sentinel source id", () => {
    const result = annotationScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "annotation",
      sourceId: "UI",
      metadata: {
        rawFeedback: "Highlight the unsafe claim.",
        messageIndex: 2,
        partIndex: 0,
        startOffset: 5,
        endOffset: 22,
      },
    })

    expect(result.success).toBe(true)
  })

  it("accepts the API sentinel source id for conversation-level annotations", () => {
    const result = annotationScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "annotation",
      sourceId: "API",
      metadata: {
        rawFeedback: "This whole conversation handled the request correctly.",
      },
    })

    expect(result.success).toBe(true)
  })

  it("accepts message anchor metadata without persisting resolved text (coordinates only)", () => {
    const result = annotationScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "annotation",
      sourceId: "UI",
      metadata: {
        rawFeedback: "Bad tone",
        messageIndex: 1,
        partIndex: 0,
      },
    })

    expect(result.success).toBe(true)
  })

  it("accepts an annotation queue cuid source id", () => {
    const result = annotationScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "annotation",
      sourceId: thirdCuid,
      metadata: {
        rawFeedback: "Queue-backed annotation.",
        messageIndex: 0,
      },
    })

    expect(result.success).toBe(true)
  })

  it("rejects incomplete text offsets", () => {
    const result = annotationScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "annotation",
      sourceId: thirdCuid,
      metadata: {
        rawFeedback: "Missing end offset",
        messageIndex: 1,
        startOffset: 4,
      },
    })

    expect(result.success).toBe(false)
  })

  it("rejects part-level anchors without a message index", () => {
    const result = annotationScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "annotation",
      sourceId: "UI",
      metadata: {
        rawFeedback: "Missing message index",
        partIndex: 0,
      },
    })

    expect(result.success).toBe(false)
  })

  it("rejects text offsets without a part index", () => {
    const result = annotationScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "annotation",
      sourceId: thirdCuid,
      metadata: {
        rawFeedback: "Offsets need a part index",
        messageIndex: 1,
        startOffset: 4,
        endOffset: 12,
      },
    })

    expect(result.success).toBe(false)
  })

  it("accepts a 'pretty-json' textFormat on the anchor", () => {
    const result = annotationAnchorSchema.safeParse({
      messageIndex: 1,
      partIndex: 0,
      startOffset: 4,
      endOffset: 12,
      textFormat: "pretty-json",
    })

    expect(result.success).toBe(true)
  })

  it("rejects an unknown textFormat value", () => {
    const result = annotationAnchorSchema.safeParse({
      messageIndex: 1,
      partIndex: 0,
      startOffset: 4,
      endOffset: 12,
      textFormat: "yaml",
    })

    expect(result.success).toBe(false)
  })
})

describe("customScoreSchema", () => {
  it("keeps arbitrary custom metadata", () => {
    const result = customScoreSchema.safeParse({
      ...buildBaseScoreInput(),
      source: "custom",
      sourceId: "batch-import",
      metadata: {
        rubric: "release-check",
        threshold: 0.9,
        labels: ["canary", "nightly"],
      },
    })

    expect(result.success).toBe(true)
  })
})

describe("score constants", () => {
  it("keeps the draft publish debounce at five minutes", () => {
    expect(SCORE_PUBLICATION_DEBOUNCE).toBe(300_000)
  })
})
