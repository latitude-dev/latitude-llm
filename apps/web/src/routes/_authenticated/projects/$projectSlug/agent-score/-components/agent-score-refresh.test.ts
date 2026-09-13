import { describe, expect, it, vi } from "vitest"
import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { agentScoreExplanationForDate, waitForAgentScoreRefresh } from "./agent-score-refresh.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>

describe("agentScoreExplanationForDate", () => {
  const explanation = {
    publication: { status: "published" },
    window: { to: "2026-09-12T04:00:00.000Z" },
  } as unknown as Explanation

  it("keeps an explanation computed for the requested score date", () => {
    expect(agentScoreExplanationForDate({ explanation, date: "2026-09-12" })).toBe(explanation)
  })

  it("hides a cached explanation from an earlier score date", () => {
    expect(agentScoreExplanationForDate({ explanation, date: "2026-09-13" })).toBeNull()
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
