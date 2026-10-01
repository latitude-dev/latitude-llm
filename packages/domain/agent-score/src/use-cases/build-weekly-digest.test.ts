import { SCORE_DIMENSIONS } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { AgentScoreSnapshot, DimensionSnapshot } from "../entities/agent-score-snapshot.ts"
import { agentScoreDigestWindow, buildWeeklyAgentScoreDigest } from "./build-weekly-digest.ts"

const WINDOW_START = "2026-09-16"
const WINDOW_END = "2026-09-22"

const dimensions = (score: number): Record<(typeof SCORE_DIMENSIONS)[number], DimensionSnapshot> =>
  Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [dimension, { score, interval: { lower: score - 2, upper: score + 2 } }]),
  ) as Record<(typeof SCORE_DIMENSIONS)[number], DimensionSnapshot>

const snapshot = (overrides: {
  readonly date: string
  readonly score: number
  readonly spread?: number
  readonly scoringVersion?: string
  readonly windowDays?: number
  readonly dimensionScore?: number
}): AgentScoreSnapshot => {
  const spread = overrides.spread ?? 2
  return {
    organizationId: "o".repeat(24),
    projectId: "p".repeat(24),
    date: overrides.date,
    scoringVersion: overrides.scoringVersion ?? "agent-score-v5-provisional",
    windowDays: overrides.windowDays ?? 7,
    eligibleSessionCount: 120,
    score: overrides.score,
    interval: { lower: overrides.score - spread, upper: overrides.score + spread },
    dimensions: dimensions(overrides.dimensionScore ?? overrides.score),
    createdAt: new Date(`${overrides.date}T04:00:00.000Z`),
  }
}

const build = (snapshots: readonly AgentScoreSnapshot[]) =>
  buildWeeklyAgentScoreDigest({ snapshots, windowStart: WINDOW_START, windowEnd: WINDOW_END })

describe("agentScoreDigestWindow", () => {
  it("spans seven inclusive UTC dates ending on the day it runs", () => {
    expect(agentScoreDigestWindow(new Date("2026-09-22T08:00:00.000Z"))).toEqual({
      from: "2026-09-16",
      to: "2026-09-22",
    })
  })

  it("takes the UTC date, not the local one", () => {
    expect(agentScoreDigestWindow(new Date("2026-09-22T23:30:00.000Z")).to).toBe("2026-09-22")
  })
})

describe("buildWeeklyAgentScoreDigest", () => {
  it("skips a project with no published score in the window", () => {
    expect(build([])).toEqual({ status: "skipped", reason: "no-score" })
  })

  it("ignores snapshots outside the window", () => {
    const result = build([snapshot({ date: "2026-09-10", score: 50 })])

    expect(result).toEqual({ status: "skipped", reason: "no-score" })
  })

  it("reports the newest snapshot with no comparison when only one day published", () => {
    const result = build([snapshot({ date: "2026-09-20", score: 71 })])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.digest.date).toBe("2026-09-20")
    expect(result.digest.score).toBe(71)
    expect(result.digest.publishedDayCount).toBe(1)
    expect(result.digest.comparison).toEqual({ status: "none" })
  })

  it("leads with the newest snapshot even when it is not the last day of the window", () => {
    const result = build([snapshot({ date: "2026-09-17", score: 60 }), snapshot({ date: "2026-09-19", score: 66 })])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.digest.date).toBe("2026-09-19")
    expect(result.digest.score).toBe(66)
  })

  it("does not depend on the order snapshots arrive in", () => {
    const oldest = snapshot({ date: "2026-09-17", score: 60 })
    const newest = snapshot({ date: "2026-09-21", score: 68 })

    expect(build([newest, oldest])).toEqual(build([oldest, newest]))
  })

  it("baselines against the oldest snapshot in the window, gaps and all", () => {
    const result = build([
      snapshot({ date: "2026-09-17", score: 60, spread: 1 }),
      snapshot({ date: "2026-09-21", score: 70, spread: 1 }),
    ])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.digest.publishedDayCount).toBe(2)
    expect(result.digest.comparison).toEqual({
      status: "comparable",
      baselineDate: "2026-09-17",
      baselineScore: 60,
      delta: 10,
      significant: true,
    })
  })

  it("marks a move inside the confidence intervals as not significant", () => {
    const result = build([
      snapshot({ date: "2026-09-17", score: 60, spread: 5 }),
      snapshot({ date: "2026-09-21", score: 62, spread: 5 }),
    ])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.digest.comparison).toMatchObject({ status: "comparable", delta: 2, significant: false })
  })

  it("treats touching intervals as overlapping", () => {
    const result = build([
      snapshot({ date: "2026-09-17", score: 60, spread: 2 }),
      snapshot({ date: "2026-09-21", score: 64, spread: 2 }),
    ])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.digest.comparison).toMatchObject({ significant: false })
  })

  it("refuses to compare across a scoring version change", () => {
    const result = build([
      snapshot({ date: "2026-09-17", score: 60, scoringVersion: "agent-score-v4" }),
      snapshot({ date: "2026-09-21", score: 70, scoringVersion: "agent-score-v5-provisional" }),
    ])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.digest.comparison).toEqual({
      status: "incomparable",
      reason: "scoringVersion",
      baselineDate: "2026-09-17",
      baselineScore: 60,
    })
  })

  it("refuses to compare across a window step change", () => {
    const result = build([
      snapshot({ date: "2026-09-17", score: 60, windowDays: 7 }),
      snapshot({ date: "2026-09-21", score: 70, windowDays: 28 }),
    ])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.digest.comparison).toMatchObject({ status: "incomparable", reason: "windowDays" })
  })

  it("carries per-dimension deltas when the composite is comparable", () => {
    const result = build([
      snapshot({ date: "2026-09-17", score: 60, dimensionScore: 55 }),
      snapshot({ date: "2026-09-21", score: 70, dimensionScore: 65 }),
    ])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    for (const dimension of SCORE_DIMENSIONS) {
      expect(result.digest.dimensions[dimension]).toEqual({ score: 65, delta: 10 })
    }
  })

  it("leaves per-dimension deltas null when the composite cannot be compared", () => {
    const result = build([
      snapshot({ date: "2026-09-17", score: 60, dimensionScore: 55, windowDays: 7 }),
      snapshot({ date: "2026-09-21", score: 70, dimensionScore: 65, windowDays: 14 }),
    ])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    for (const dimension of SCORE_DIMENSIONS) {
      expect(result.digest.dimensions[dimension]).toEqual({ score: 65, delta: null })
    }
  })

  it("leaves per-dimension deltas null when there is no baseline", () => {
    const result = build([snapshot({ date: "2026-09-21", score: 70, dimensionScore: 65 })])

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.digest.dimensions.outcome).toEqual({ score: 65, delta: null })
  })
})
