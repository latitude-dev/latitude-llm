import { describe, expect, it } from "vitest"
import { decodeSessionAssessmentCursor, encodeSessionAssessmentCursor } from "./session-assessment-cursor.ts"

describe("session assessment cursor", () => {
  it("round-trips the snapshot and stable chronology identity", () => {
    const cursor = encodeSessionAssessmentCursor({
      cutoff: new Date("2026-01-02T00:00:00.000Z"),
      lastItem: {
        item: {
          id: "human:score-ü",
          evidenceKey: "finding-ü",
          label: "Finding",
          source: "score",
          signalIds: [],
          scoreIds: ["score-ü"],
          occurrenceCount: 1,
          effects: [],
          anchors: [],
          destinations: [],
        },
        chronology: { occurredAt: new Date("2026-01-01T00:00:00.000Z"), messageIndex: 3 },
        independentHumanEvidence: true,
      },
    })

    expect(decodeSessionAssessmentCursor(cursor)).toEqual({
      version: 1,
      cutoff: "2026-01-02T00:00:00.000Z",
      occurredAt: "2026-01-01T00:00:00.000Z",
      messageIndex: 3,
      evidenceKey: "finding-ü",
      itemId: "human:score-ü",
    })
  })

  it("rejects malformed cursors", () => {
    expect(decodeSessionAssessmentCursor("not-a-cursor")).toBeNull()
  })
})
