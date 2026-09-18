import { describe, expect, it } from "vitest"
import { resolveScoringCutoff, resolveSnapshotScoringCutoff } from "./agent-score-snapshot.ts"

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

describe("resolveSnapshotScoringCutoff", () => {
  it("reuses the published snapshot cutoff on a forced refresh", () => {
    const publishedAt = new Date("2026-09-15T08:00:00.000Z")
    const refreshedAt = new Date("2026-09-15T15:00:00.000Z")

    expect(resolveSnapshotScoringCutoff("2026-09-15", refreshedAt, { createdAt: publishedAt }, true)).toEqual(
      resolveScoringCutoff("2026-09-15", publishedAt),
    )
    expect(resolveSnapshotScoringCutoff("2026-09-15", refreshedAt, { createdAt: publishedAt }, true)).not.toEqual(
      resolveScoringCutoff("2026-09-15", refreshedAt),
    )
  })

  it("uses the current instant when no snapshot exists yet", () => {
    const now = new Date("2026-09-15T15:00:00.000Z")

    expect(resolveSnapshotScoringCutoff("2026-09-15", now, null, true)).toEqual(resolveScoringCutoff("2026-09-15", now))
  })
})
