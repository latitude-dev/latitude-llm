import { describe, expect, it } from "vitest"
import type { ScoreRecord } from "../../../../../../domains/scores/scores.functions.ts"
import { findAnchoredSignalScore } from "./use-focus-signal-score.ts"

function score(overrides: Partial<ScoreRecord> & { readonly id: string }): ScoreRecord {
  return {
    organizationId: "org-1",
    projectId: "project-1",
    sessionId: "session-1",
    traceId: "trace-1",
    spanId: null,
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    signalId: "signal-1",
    evaluationSignalId: null,
    value: 0,
    passed: false,
    feedback: "feedback",
    metadata: { messageIndex: 3 },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: "user-1",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  }
}

describe("findAnchoredSignalScore", () => {
  it("picks the newest anchored score the signal recorded", () => {
    const found = findAnchoredSignalScore({
      scores: [
        score({ id: "older", createdAt: "2026-08-01T09:00:00.000Z" }),
        score({ id: "newer", createdAt: "2026-08-01T11:00:00.000Z" }),
      ],
      signalId: "signal-1",
    })

    expect(found?.id).toBe("newer")
  })

  it("ignores scores of other signals, other sources, and unanchored scores", () => {
    const found = findAnchoredSignalScore({
      scores: [
        score({ id: "other-signal", signalId: "signal-2" }),
        score({ id: "evaluation", source: "evaluation", metadata: {} }),
        score({ id: "conversation-level", metadata: {} }),
        score({ id: "no-trace", traceId: null }),
        score({ id: "anchored", createdAt: "2026-08-01T08:00:00.000Z" }),
      ],
      signalId: "signal-1",
    })

    expect(found?.id).toBe("anchored")
  })

  it("returns null when the signal has no anchored score in the session", () => {
    expect(
      findAnchoredSignalScore({
        scores: [score({ id: "conversation-level", metadata: {} })],
        signalId: "signal-1",
      }),
    ).toBeNull()
  })
})
