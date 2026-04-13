import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function formatSeedTimestamp(date: Date): string {
  return date.toISOString().slice(0, 23).replace("T", " ")
}

function countIssueOccurrencesByDay(
  issueId: string,
  occurrences: readonly { readonly issueId: string; readonly daysAgo: number }[],
) {
  const counts = new Map<number, number>()

  for (const occurrence of occurrences) {
    if (occurrence.issueId !== issueId) {
      continue
    }

    counts.set(occurrence.daysAgo, (counts.get(occurrence.daysAgo) ?? 0) + 1)
  }

  return counts
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

  it("includes seeded escalating and regressed issue occurrence shapes for histogram demos", async () => {
    vi.setSystemTime(new Date("2026-04-10T11:23:45.000Z"))
    vi.resetModules()

    const { SEED_ACCESS_ISSUE_ID, SEED_COMBINATION_ISSUE_ID, SEED_INSTALLATION_ISSUE_ID } = await import("./seeds.ts")
    const { SEED_ADDITIONAL_ISSUE_OCCURRENCES, SEED_ISSUE_FIXTURES_BY_ID } = await import("./seed-content/issues.ts")

    const accessCounts = countIssueOccurrencesByDay(SEED_ACCESS_ISSUE_ID, SEED_ADDITIONAL_ISSUE_OCCURRENCES)
    expect(accessCounts.get(0)).toBeGreaterThanOrEqual(20)
    expect([...accessCounts.values()].some((count) => count >= 20)).toBe(true)
    expect([...accessCounts.values()].some((count) => count > 0 && count < 20)).toBe(true)

    const installationCounts = countIssueOccurrencesByDay(SEED_INSTALLATION_ISSUE_ID, SEED_ADDITIONAL_ISSUE_OCCURRENCES)
    expect(installationCounts.get(0)).toBeGreaterThanOrEqual(20)
    expect([...installationCounts.values()].some((count) => count >= 20)).toBe(true)
    expect([...installationCounts.values()].some((count) => count > 0 && count < 20)).toBe(true)

    const combinationIssue = SEED_ISSUE_FIXTURES_BY_ID.get(SEED_COMBINATION_ISSUE_ID)
    expect(combinationIssue?.resolvedDaysAgo).not.toBeNull()

    const resolvedDaysAgo = combinationIssue?.resolvedDaysAgo ?? 0
    const combinationCounts = countIssueOccurrencesByDay(SEED_COMBINATION_ISSUE_ID, SEED_ADDITIONAL_ISSUE_OCCURRENCES)

    expect(
      [...combinationCounts.keys()].some((daysAgo) => daysAgo > resolvedDaysAgo && daysAgo <= resolvedDaysAgo + 14),
    ).toBe(true)
    expect([...combinationCounts.keys()].some((daysAgo) => daysAgo < resolvedDaysAgo)).toBe(true)
    expect([...combinationCounts.values()].some((count) => count >= 20)).toBe(true)
    expect([...combinationCounts.values()].some((count) => count > 0 && count < 20)).toBe(true)
  })
})
