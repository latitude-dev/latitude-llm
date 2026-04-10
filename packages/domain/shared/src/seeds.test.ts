import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function formatSeedTimestamp(date: Date): string {
  return date.toISOString().slice(0, 23).replace("T", " ")
}

describe("seed timeline helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  it("clamps same-day seed dates to the current seed time when the requested hour is later today", async () => {
    const now = new Date("2026-04-10T11:23:45.000Z")
    vi.setSystemTime(now)
    vi.resetModules()

    const { seedDateDaysAgo, seedTimestampDaysAgo } = await import("./seeds.ts")

    expect(seedDateDaysAgo(0, 16, 30).toISOString()).toBe(now.toISOString())
    expect(seedTimestampDaysAgo(0, 16, 30)).toBe(formatSeedTimestamp(now))
  })

  it("preserves explicit clock times for earlier days", async () => {
    vi.setSystemTime(new Date("2026-04-10T11:23:45.000Z"))
    vi.resetModules()

    const { seedDateDaysAgo, seedTimestampDaysAgo } = await import("./seeds.ts")

    expect(seedDateDaysAgo(1, 16, 30).toISOString()).toBe("2026-04-09T16:30:00.000Z")
    expect(seedTimestampDaysAgo(1, 16, 30)).toBe("2026-04-09 16:30:00.000")
  })

  it("keeps enough seeded issues to exercise infinite scroll", async () => {
    vi.setSystemTime(new Date("2026-04-10T11:23:45.000Z"))
    vi.resetModules()

    const { SEED_ISSUE_COUNT } = await import("./seed-content/issues.ts")

    expect(SEED_ISSUE_COUNT).toBeGreaterThanOrEqual(100)
  })
})
