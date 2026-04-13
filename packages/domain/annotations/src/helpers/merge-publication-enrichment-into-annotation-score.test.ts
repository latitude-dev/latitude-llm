import type { AnnotationScore } from "@domain/scores"
import { ScoreId, SessionId, SpanId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { mergeEnrichmentIntoAnnotationScoreForPublication } from "./merge-publication-enrichment-into-annotation-score.ts"

const baseScore = {
  id: ScoreId("s".repeat(24)),
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  sessionId: null,
  traceId: null,
  spanId: null,
  source: "annotation",
  sourceId: "UI",
  simulationId: null,
  issueId: "i".repeat(24),
  value: 0.2,
  passed: false,
  feedback: "raw",
  metadata: { rawFeedback: "raw" },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: new Date("2026-03-24T00:00:00.000Z"),
  createdAt: new Date("2026-03-24T00:00:00.000Z"),
  updatedAt: new Date("2026-03-24T00:00:00.000Z"),
} as AnnotationScore

describe("mergeEnrichmentIntoAnnotationScoreForPublication", () => {
  it("clears issue intent, applies enrichment and clears draft", () => {
    const session = SessionId("e".repeat(24))
    const span = SpanId("f".repeat(16))
    const out = mergeEnrichmentIntoAnnotationScoreForPublication(baseScore, {
      enrichedFeedback: "Enriched one-liner",
      resolvedSessionId: session,
      resolvedSpanId: span,
    })

    expect(out.issueId).toBeNull()
    expect(out.feedback).toBe("Enriched one-liner")
    expect(out.draftedAt).toBeNull()
    expect(out.sessionId).toBe(session)
    expect(out.spanId).toBe(span)
    expect(out.updatedAt).toBeInstanceOf(Date)
  })

  it("allows null session and span", () => {
    const out = mergeEnrichmentIntoAnnotationScoreForPublication(baseScore, {
      enrichedFeedback: "X",
      resolvedSessionId: null,
      resolvedSpanId: null,
    })
    expect(out.sessionId).toBeNull()
    expect(out.spanId).toBeNull()
  })
})
