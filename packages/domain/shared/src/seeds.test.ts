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

    const { SEED_ACCESS_ISSUE_ID, SEED_COMBINATION_ISSUE_ID, SEED_INSTALLATION_ISSUE_ID, SEED_RETURNS_ISSUE_ID } =
      await import("./seeds.ts")
    const { SEED_ADDITIONAL_ISSUE_OCCURRENCES, SEED_ISSUE_FIXTURES_BY_ID } = await import("./seed-content/issues.ts")

    const accessCounts = countIssueOccurrencesByDay(SEED_ACCESS_ISSUE_ID, SEED_ADDITIONAL_ISSUE_OCCURRENCES)
    expect(accessCounts.get(0)).toBeGreaterThanOrEqual(20)
    expect([...accessCounts.values()].some((count) => count >= 20)).toBe(true)
    expect([...accessCounts.values()].some((count) => count > 0 && count < 20)).toBe(true)

    const combinationIssue = SEED_ISSUE_FIXTURES_BY_ID.get(SEED_COMBINATION_ISSUE_ID)
    expect(combinationIssue?.resolvedDaysAgo).not.toBeNull()

    const combinationResolvedDaysAgo = combinationIssue?.resolvedDaysAgo ?? 0
    const combinationCounts = countIssueOccurrencesByDay(SEED_COMBINATION_ISSUE_ID, SEED_ADDITIONAL_ISSUE_OCCURRENCES)

    expect(
      [...combinationCounts.keys()].some(
        (daysAgo) => daysAgo > combinationResolvedDaysAgo && daysAgo <= combinationResolvedDaysAgo + 14,
      ),
    ).toBe(true)
    expect([...combinationCounts.keys()].some((daysAgo) => daysAgo < combinationResolvedDaysAgo)).toBe(true)
    expect(combinationCounts.get(0)).toBeGreaterThanOrEqual(20)
    expect([...combinationCounts.values()].some((count) => count >= 20)).toBe(true)
    expect([...combinationCounts.values()].some((count) => count > 0 && count < 20)).toBe(true)

    const returnsIssue = SEED_ISSUE_FIXTURES_BY_ID.get(SEED_RETURNS_ISSUE_ID)
    expect(returnsIssue?.resolvedDaysAgo).not.toBeNull()

    const returnsResolvedDaysAgo = returnsIssue?.resolvedDaysAgo ?? 0
    const returnsCounts = countIssueOccurrencesByDay(SEED_RETURNS_ISSUE_ID, SEED_ADDITIONAL_ISSUE_OCCURRENCES)

    expect(
      [...returnsCounts.keys()].some(
        (daysAgo) => daysAgo > returnsResolvedDaysAgo && daysAgo <= returnsResolvedDaysAgo + 14,
      ),
    ).toBe(true)
    expect([...returnsCounts.keys()].some((daysAgo) => daysAgo < returnsResolvedDaysAgo)).toBe(true)
    expect(returnsCounts.get(0) ?? 0).toBeLessThan(20)
    expect(returnsCounts.has(1)).toBe(false)

    const installationIssue = SEED_ISSUE_FIXTURES_BY_ID.get(SEED_INSTALLATION_ISSUE_ID)
    expect(installationIssue?.resolvedDaysAgo).not.toBeNull()

    const installationResolvedDaysAgo = installationIssue?.resolvedDaysAgo ?? 0
    const installationCounts = countIssueOccurrencesByDay(SEED_INSTALLATION_ISSUE_ID, SEED_ADDITIONAL_ISSUE_OCCURRENCES)

    expect(
      [...installationCounts.keys()].some(
        (daysAgo) => daysAgo > installationResolvedDaysAgo && daysAgo <= installationResolvedDaysAgo + 14,
      ),
    ).toBe(true)
    expect([...installationCounts.keys()].some((daysAgo) => daysAgo < installationResolvedDaysAgo)).toBe(true)
    expect(installationCounts.get(0) ?? 0).toBeLessThan(20)
    expect(installationCounts.has(1)).toBe(false)
  })

  it("assigns deterministic trace ids to seeded issue occurrences and keeps long-tail feedback issue-specific", async () => {
    vi.setSystemTime(new Date("2026-04-10T11:23:45.000Z"))
    vi.resetModules()

    const { seedIssueOccurrenceSpanId, seedIssueOccurrenceTraceId } = await import("./seeds.ts")
    const { SEED_ADDITIONAL_ISSUE_OCCURRENCES } = await import("./seed-content/issues.ts")

    const traceIds = SEED_ADDITIONAL_ISSUE_OCCURRENCES.map((_, index) => seedIssueOccurrenceTraceId(index))
    const spanIds = SEED_ADDITIONAL_ISSUE_OCCURRENCES.map((_, index) => seedIssueOccurrenceSpanId(index))
    const longTailFeedback = SEED_ADDITIONAL_ISSUE_OCCURRENCES.filter((occurrence) => {
      const importName = occurrence.metadata.importName
      return importName === "seed-issue-scout" || importName === "backlog-audit"
    }).map((occurrence) => occurrence.feedback)

    expect(new Set(traceIds).size).toBe(SEED_ADDITIONAL_ISSUE_OCCURRENCES.length)
    expect(new Set(spanIds).size).toBe(SEED_ADDITIONAL_ISSUE_OCCURRENCES.length)
    expect(longTailFeedback.length).toBeGreaterThan(0)
    expect(longTailFeedback.every((feedback) => !feedback.startsWith("Seeded long-tail issue evidence captured"))).toBe(
      true,
    )
    expect(longTailFeedback.every((feedback) => feedback.includes("seeded conversation"))).toBe(true)
  })
})
