import { describe, expect, it, vi } from "vitest"
import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { agentScoreExplanationForSnapshot, waitForAgentScoreRefresh } from "./agent-score-refresh.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>

describe("agentScoreExplanationForSnapshot", () => {
  const explanation = {
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

describe("waitForAgentScoreRefresh", () => {
  it("keeps polling until the refreshed result arrives", async () => {
    const refetch = vi.fn().mockResolvedValueOnce("before").mockResolvedValueOnce("after")
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(
      waitForAgentScoreRefresh({ previousMarker: "before", refetch, attempts: 3, intervalMs: 1, wait }),
    ).resolves.toBe(true)
    expect(refetch).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledTimes(1)
  })

  it("stops after the polling limit when nothing changes", async () => {
    const refetch = vi.fn().mockResolvedValue("before")
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(
      waitForAgentScoreRefresh({ previousMarker: "before", refetch, attempts: 2, intervalMs: 1, wait }),
    ).resolves.toBe(false)
    expect(refetch).toHaveBeenCalledTimes(2)
  })
})
