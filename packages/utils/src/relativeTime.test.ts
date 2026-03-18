import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { relativeTime } from "./relativeTime.ts"

describe("relativeTime", () => {
  const SECONDS = 1000
  const MINUTES = 60 * SECONDS
  const HOURS = 60 * MINUTES
  const DAYS = 24 * HOURS

  const NOW = new Date(2000, 6, 31, 12, 0, 0) // Monday Jul 31, 2000 12:00:00

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 'just now' for less than a minute", () => {
    expect(relativeTime(new Date(NOW.getTime() - 3 * SECONDS))).toBe("just now")
    expect(relativeTime(new Date(NOW.getTime() - 59 * SECONDS))).toBe("just now")
  })

  it("returns relative minutes for < 1 hour", () => {
    expect(relativeTime(new Date(NOW.getTime() - 2 * MINUTES))).toBe("2 minutes ago")
    expect(relativeTime(new Date(NOW.getTime() - 30 * MINUTES))).toBe("30 minutes ago")
  })

  it("returns relative hours for < 24 hours", () => {
    expect(relativeTime(new Date(NOW.getTime() - 2 * HOURS))).toBe("2 hours ago")
    expect(relativeTime(new Date(NOW.getTime() - 12 * HOURS))).toBe("12 hours ago")
  })

  it("returns 'Yesterday at {time}' for < 2 days", () => {
    const result = relativeTime(new Date(NOW.getTime() - 30 * HOURS))
    expect(result).toMatch(/^Yesterday at \d{1,2}:\d{2}\s[AP]M$/)
  })

  it("returns '{month} {day} at {time}' for 2 days to 10 months", () => {
    const threeDays = relativeTime(new Date(NOW.getTime() - 3 * DAYS))
    expect(threeDays).toMatch(/^July 28 at \d{1,2}:\d{2}\s[AP]M$/)

    const thirtyDays = relativeTime(new Date(NOW.getTime() - 30 * DAYS))
    expect(thirtyDays).toMatch(/^July 1 at \d{1,2}:\d{2}\s[AP]M$/)
  })

  it("returns '{month} {day}, {year} at {time}' for >= 10 months", () => {
    // 365 days ago
    const result = relativeTime(new Date(NOW.getTime() - 365 * DAYS))
    expect(result).toMatch(/^August 1, 1999 at \d{1,2}:\d{2}\s[AP]M$/)
  })

  it("accepts string input", () => {
    const dateStr = new Date(NOW.getTime() - 5 * MINUTES).toISOString()
    expect(relativeTime(dateStr)).toBe("5 minutes ago")
  })

  it('returns "-" for null or undefined', () => {
    expect(relativeTime(null)).toBe("-")
    expect(relativeTime(undefined)).toBe("-")
  })
})
