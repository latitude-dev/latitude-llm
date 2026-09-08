import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { decodeSessionAssessmentCursor } from "../pagination/session-assessment-cursor.ts"
import { resolveSessionAssessmentPage } from "./resolve-session-assessment.ts"

const finding = (index: number): AssessmentFinding => ({
  evidenceKey: `finding-${String(index).padStart(3, "0")}`,
  label: `Finding ${index}`,
  source: "score",
  signalIds: [],
  scoreIds: [`score-${index}`],
  occurrenceCount: 1,
  chronology: { occurredAt: new Date(1_700_000_000_000 + index) },
  anchors: [],
  destinations: [],
  independentHumanEvidence: false,
  kind: "standaloneScore",
  negative: false,
  judgmentKind: "annotation",
})

const input: NormalizedSessionAssessmentInput = {
  sessionId: SessionId("session-1"),
  observedMicrocents: 10,
  observedDurationNs: 20,
  findings: Array.from({ length: 101 }, (_, index) => finding(index)),
  readers: [
    {
      readerId: "reader-1",
      label: "Reader",
      scoreDimensions: ["outcome"],
      applicable: true,
      findingCount: 101,
      readableCount: 1,
      totalCount: 1,
    },
  ],
  screeningDecisions: [],
}

describe("resolveSessionAssessmentPage", () => {
  it("paginates by chronology and evidence identity while retaining complete summaries", () => {
    const cutoff = new Date("2026-01-02T00:00:00.000Z")
    const first = resolveSessionAssessmentPage(input, { cutoff })
    const cursor = first.nextCursor ? decodeSessionAssessmentCursor(first.nextCursor) : null

    expect(first.items).toHaveLength(100)
    expect(first.items[0]?.evidenceKey).toBe("finding-000")
    expect(first.items.at(-1)?.evidenceKey).toBe("finding-099")
    expect(cursor).toMatchObject({ cutoff: cutoff.toISOString(), evidenceKey: "finding-099" })

    if (!cursor) throw new Error("expected cursor")
    const second = resolveSessionAssessmentPage(input, { cutoff, cursor })
    expect(second.items.map(({ evidenceKey }) => evidenceKey)).toEqual(["finding-100"])
    expect(second.nextCursor).toBeUndefined()
    expect(second.dimensions).toEqual(first.dimensions)
    expect(second.coverage).toEqual(first.coverage)
  })
})
