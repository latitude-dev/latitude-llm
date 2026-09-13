import { describe, expect, it, vi } from "vitest"
import { waitForAgentScoreRefresh } from "./agent-score-refresh.ts"

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
