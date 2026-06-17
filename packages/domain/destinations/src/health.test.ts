import { describe, expect, it } from "vitest"
import { DESTINATION_LAG_WARNING_MS } from "./constants.ts"
import { deriveDestinationHealth } from "./health.ts"

describe("deriveDestinationHealth", () => {
  it("active + all sources caught up → healthy, Up-to-date", () => {
    const health = deriveDestinationHealth({
      status: "active",
      sources: [{ lagMs: null }],
      latestRun: { status: "succeeded", eventsDropped: 0 },
    })
    expect(health.badge).toBe("healthy")
    expect(health.lagMs).toBeNull()
    expect(health.lastRunStatus).toBe("succeeded")
  })

  it("active + small lag → healthy", () => {
    const health = deriveDestinationHealth({ status: "active", sources: [{ lagMs: 5 * 60_000 }], latestRun: null })
    expect(health.badge).toBe("healthy")
    expect(health.lagMs).toBe(5 * 60_000)
  })

  it("active + lag beyond the warning threshold → lagging", () => {
    const health = deriveDestinationHealth({
      status: "active",
      sources: [{ lagMs: DESTINATION_LAG_WARNING_MS + 60_000 }],
      latestRun: { status: "succeeded", eventsDropped: 0 },
    })
    expect(health.badge).toBe("lagging")
  })

  it("headline lag is the worst across enabled sources; caught-up source doesn't mask a behind one", () => {
    const health = deriveDestinationHealth({
      status: "active",
      sources: [{ lagMs: null }, { lagMs: 30 * 60_000 }],
      latestRun: null,
    })
    expect(health.lagMs).toBe(30 * 60_000)
  })

  it("no enabled sources → null lag, healthy", () => {
    const health = deriveDestinationHealth({ status: "active", sources: [], latestRun: null })
    expect(health.lagMs).toBeNull()
    expect(health.badge).toBe("healthy")
  })

  it("paused and quarantined statuses win over lag", () => {
    const farBehind = [{ lagMs: 600 * 60_000 }]
    expect(deriveDestinationHealth({ status: "paused", sources: farBehind, latestRun: null }).badge).toBe("paused")
    expect(deriveDestinationHealth({ status: "quarantined", sources: farBehind, latestRun: null }).badge).toBe(
      "quarantined",
    )
  })

  it("surfaces dropped events from the latest run", () => {
    const health = deriveDestinationHealth({
      status: "active",
      sources: [{ lagMs: null }],
      latestRun: { status: "succeeded", eventsDropped: 3 },
    })
    expect(health.eventsDropped).toBe(3)
  })
})
