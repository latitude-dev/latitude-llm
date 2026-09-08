import type { SessionAssessment } from "@domain/agent-score"
import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { mergeSessionAssessmentPages } from "./session-assessment-pages.ts"

const page = (itemIds: readonly string[], nextCursor?: string): SessionAssessment => ({
  sessionId: SessionId("session-1"),
  dimensions: [],
  coverage: { readers: [] },
  items: itemIds.map((id) => ({
    id,
    evidenceKey: id,
    groupKey: `judgment:${id}`,
    label: id,
    source: "score",
    polarity: "unknown",
    impactLevel: "low",
    signalIds: [],
    scoreIds: [],
    occurrenceCount: 1,
    effects: [],
    anchors: [],
    destinations: [],
  })),
  ...(nextCursor ? { nextCursor } : {}),
})

describe("mergeSessionAssessmentPages", () => {
  it("keeps the first page summaries while appending cursor pages in order", () => {
    const first = page(["item-1", "item-2"], "cursor-2")
    const second = page(["item-3"], "cursor-3")
    first.coverage.readers.push({
      readerId: "reader-1",
      label: "Reader",
      scoreDimensions: ["reliability"],
      status: "examined",
      findingCount: 3,
    })

    const merged = mergeSessionAssessmentPages([first, second])

    expect(merged?.items.map((item) => item.id)).toEqual(["item-1", "item-2", "item-3"])
    expect(merged?.coverage).toBe(first.coverage)
    expect(merged?.nextCursor).toBe("cursor-3")
  })

  it("clears the cursor when the final page is exhausted", () => {
    expect(mergeSessionAssessmentPages([page(["item-1"], "cursor-2"), page(["item-2"])])?.nextCursor).toBeUndefined()
  })

  it("preserves the domain assessment semantics used by the web panel", () => {
    const assessment = page(["item-1"], "cursor-2")
    const merged = mergeSessionAssessmentPages([assessment])

    expect(merged?.sessionId).toBe(assessment.sessionId)
    expect(merged?.items).toEqual(assessment.items)
    expect(merged?.dimensions).toBe(assessment.dimensions)
    expect(merged?.coverage).toBe(assessment.coverage)
  })
})
