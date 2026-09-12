import { describe, expect, it } from "vitest"
import { resolveScoringCutoff } from "./agent-score-snapshot.ts"

describe("resolveScoringCutoff", () => {
  it("ends the window at the end of a date that is already over", () => {
    const cutoff = resolveScoringCutoff("2026-09-29", new Date("2026-10-02T04:00:00.000Z"))

    expect(cutoff.toISOString()).toBe("2026-09-30T00:00:00.000Z")
  })

  it("never ends the window in the future", () => {
    const cutoff = resolveScoringCutoff("2026-09-29", new Date("2026-09-29T04:00:00.000Z"))

    expect(cutoff.toISOString()).toBe("2026-09-29T04:00:00.000Z")
  })

  it("keeps the window the length it claims, rather than losing the hours that have not happened", () => {
    const now = new Date("2026-09-29T04:00:00.000Z")
    const cutoff = resolveScoringCutoff("2026-09-29", now)
    const oldestCovered = new Date(cutoff.getTime() - 28 * 86_400_000)

    expect(oldestCovered.toISOString()).toBe("2026-09-01T04:00:00.000Z")
    expect(cutoff.getTime()).toBeLessThanOrEqual(now.getTime())
  })
})
