import { describe, expect, it } from "vitest"
import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import {
  agentScoreExplanationForSnapshot,
  agentVitalityIsLoading,
  isCurrentAgentScoreSnapshot,
} from "./agent-score-refresh.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>

describe("agentScoreExplanationForSnapshot", () => {
  const explanation = {
    date: "2026-09-12",
    scoringVersion: "agent-score-v1-provisional",
    publication: { status: "published" },
    window: { to: "2026-09-12T04:00:00.000Z" },
  } as unknown as Explanation
  const snapshot = { scoringVersion: "agent-score-v1-provisional" }

  it("keeps an explanation computed for the requested snapshot", () => {
    expect(agentScoreExplanationForSnapshot({ explanation, date: "2026-09-12", snapshot })).toBe(explanation)
  })

  it("keeps an explanation when no snapshot was published", () => {
    expect(agentScoreExplanationForSnapshot({ explanation, date: "2026-09-12", snapshot: null })).toBe(explanation)
  })

  it("hides a cached explanation from an earlier score date", () => {
    expect(agentScoreExplanationForSnapshot({ explanation, date: "2026-09-13", snapshot })).toBeNull()
  })

  it("keeps a latest available score's explanation when it matches that score date", () => {
    const latestExplanation = { ...explanation, date: "2026-09-11" }

    expect(agentScoreExplanationForSnapshot({ explanation: latestExplanation, date: "2026-09-11", snapshot })).toBe(
      latestExplanation,
    )
  })

  it("hides a cached explanation from a different scoring version", () => {
    expect(
      agentScoreExplanationForSnapshot({
        explanation: { ...explanation, scoringVersion: "agent-score-v2-provisional" },
        date: "2026-09-12",
        snapshot,
      }),
    ).toBeNull()
  })
})

describe("isCurrentAgentScoreSnapshot", () => {
  it("does not treat a latest-available fallback as today's snapshot", () => {
    expect(isCurrentAgentScoreSnapshot({ date: "2026-09-11" }, "2026-09-12")).toBe(false)
    expect(isCurrentAgentScoreSnapshot({ date: "2026-09-12" }, "2026-09-12")).toBe(true)
  })
})

describe("agentVitalityIsLoading", () => {
  it("keeps the latest score visible while data refreshes", () => {
    expect(agentVitalityIsLoading({ date: "2026-09-12" }, true)).toBe(false)
    expect(agentVitalityIsLoading(null, true)).toBe(true)
  })
})
