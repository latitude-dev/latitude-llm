import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ScoreRecord } from "../../../../../../domains/scores/scores.functions.ts"
import { findAnchoredSignalScore, useFocusSignalScore } from "./use-focus-signal-score.ts"

const mockUseScoresBySession = vi.fn()

vi.mock("../../../../../../domains/scores/scores.collection.ts", () => ({
  useScoresBySession: (...args: unknown[]) => mockUseScoresBySession(...args),
}))

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

describe("useFocusSignalScore", () => {
  it("focuses once canFocus becomes true after scores arrive", () => {
    const anchored = score({ id: "anchored", createdAt: "2026-08-01T11:00:00.000Z" })
    mockUseScoresBySession.mockReturnValue({ data: { items: [anchored] } })
    const onFocus = vi.fn()

    const { rerender } = renderHook(
      ({ canFocus }) =>
        useFocusSignalScore({
          projectId: "project-1",
          signalId: "signal-1",
          traceIds: ["trace-1"],
          canFocus,
          onFocus,
        }),
      { initialProps: { canFocus: false } },
    )

    expect(onFocus).not.toHaveBeenCalled()

    rerender({ canFocus: true })

    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onFocus).toHaveBeenCalledWith(anchored)
  })
})
