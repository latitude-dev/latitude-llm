import { describe, expect, it } from "vitest"
import {
  CONVERSATION_MOMENT_CONTINUITY_DEFAULT_THRESHOLD,
  CONVERSATION_MOMENT_CONTINUITY_MAX_THRESHOLD,
  CONVERSATION_MOMENT_CONTINUITY_MIN_THRESHOLD,
} from "../constants.ts"
import { sessionMomentLabelSchema } from "./session-moment-label.ts"
import { SemanticMomentBoundaryReason, sessionSemanticMomentSchema } from "./session-semantic-moment.ts"

const now = new Date("2026-01-01T00:00:00.000Z")

const baseSemanticMoment = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  sessionId: "session-1",
  analysisHash: "a".repeat(64),
  momentId: "moment-1",
  traceId: "t".repeat(32),
  startTime: now,
  endTime: now,
  firstMessageIndex: 0,
  lastMessageIndex: 2,
  boundaryReason: SemanticMomentBoundaryReason.SemanticDrift,
  embedding: [0.1, 0.2],
  coherenceScore: 0.91,
  retentionDays: 90,
  indexedAt: now,
}

describe("semantic moments", () => {
  it("keeps the continuity threshold defaults bounded", () => {
    expect(CONVERSATION_MOMENT_CONTINUITY_DEFAULT_THRESHOLD).toBeGreaterThanOrEqual(
      CONVERSATION_MOMENT_CONTINUITY_MIN_THRESHOLD,
    )
    expect(CONVERSATION_MOMENT_CONTINUITY_DEFAULT_THRESHOLD).toBeLessThanOrEqual(
      CONVERSATION_MOMENT_CONTINUITY_MAX_THRESHOLD,
    )
  })

  it("validates embedding-derived semantic moments", () => {
    const parsed = sessionSemanticMomentSchema.parse(baseSemanticMoment)

    expect(parsed.momentId).toBe("moment-1")
    expect(parsed.boundaryReason).toBe(SemanticMomentBoundaryReason.SemanticDrift)
  })

  it("validates detected labels anchored to semantic moments", () => {
    const parsed = sessionMomentLabelSchema.parse({
      organizationId: baseSemanticMoment.organizationId,
      projectId: baseSemanticMoment.projectId,
      sessionId: baseSemanticMoment.sessionId,
      analysisHash: baseSemanticMoment.analysisHash,
      labelId: "label-1",
      momentId: baseSemanticMoment.momentId,
      kind: "resolution",
      actor: "assistant",
      firstMessageIndex: 1,
      lastMessageIndex: 2,
      summary: "Assistant provided the resolution.",
      evidence: "Here is how to fix it.",
      confidence: 0.8,
      retentionDays: 90,
      indexedAt: now,
    })

    expect(parsed.momentId).toBe(baseSemanticMoment.momentId)
  })
})
