import { OrganizationId, ProjectId, SCORE_DIMENSIONS } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { agentScoreSnapshotSchema } from "./agent-score-snapshot.ts"
import { syntheticAgentScoreSnapshot } from "./synthetic-agent-score-snapshot.ts"

const WEIGHTS = { outcome: 0.35, reliability: 0.25, cost: 0.15, speed: 0.15, safety: 0.1 } as const

const build = (overrides: { readonly score: number; readonly date?: string; readonly projectId?: string }) =>
  syntheticAgentScoreSnapshot({
    organizationId: OrganizationId("o".repeat(24)),
    projectId: ProjectId(overrides.projectId ?? "p".repeat(24)),
    date: overrides.date ?? "2026-09-17",
    score: overrides.score,
    scoringVersion: "agent-score-v6-provisional",
    windowDays: 14,
    eligibleSessionCount: 1_234,
    weights: WEIGHTS,
    createdAt: new Date("2026-09-17T04:05:00.000Z"),
  })

const weightedMean = (dimensions: Record<string, { readonly score: number }>): number =>
  SCORE_DIMENSIONS.reduce((total, dimension) => total + WEIGHTS[dimension] * dimensions[dimension]!.score, 0)

describe("syntheticAgentScoreSnapshot", () => {
  it("builds a snapshot the entity schema accepts", () => {
    expect(agentScoreSnapshotSchema.safeParse(build({ score: 74.4 })).success).toBe(true)
  })

  it("composes the dimensions back to the requested score", () => {
    for (const score of [0, 0.4, 12.5, 50, 74.4, 92, 99.8, 100]) {
      expect(weightedMean(build({ score }).dimensions)).toBeCloseTo(score, 6)
    }
  })

  it("scatters the dimensions rather than repeating the composite", () => {
    const { dimensions } = build({ score: 62 })
    const distinct = new Set(SCORE_DIMENSIONS.map((dimension) => dimensions[dimension].score.toFixed(4)))

    expect(distinct.size).toBe(SCORE_DIMENSIONS.length)
  })

  it("keeps every dimension and interval inside 0–100 at the extremes", () => {
    for (const score of [0, 1, 99, 100]) {
      const { dimensions, interval } = build({ score })
      expect(interval.lower).toBeGreaterThanOrEqual(0)
      expect(interval.upper).toBeLessThanOrEqual(100)
      for (const dimension of SCORE_DIMENSIONS) {
        const entry = dimensions[dimension]
        expect(entry.score).toBeGreaterThanOrEqual(0)
        expect(entry.score).toBeLessThanOrEqual(100)
        expect(entry.interval.lower).toBeGreaterThanOrEqual(0)
        expect(entry.interval.upper).toBeLessThanOrEqual(100)
        expect(entry.interval.lower).toBeLessThanOrEqual(entry.interval.upper)
      }
    }
  })

  it("is deterministic per project and date, and differs across them", () => {
    expect(build({ score: 70 })).toEqual(build({ score: 70 }))
    expect(build({ score: 70, date: "2026-09-18" }).dimensions.outcome.score).not.toBe(
      build({ score: 70 }).dimensions.outcome.score,
    )
    expect(build({ score: 70, projectId: "q".repeat(24) }).dimensions.outcome.score).not.toBe(
      build({ score: 70 }).dimensions.outcome.score,
    )
  })

  it("stores no explanation, because invented evidence would not survive being read", () => {
    expect(build({ score: 70 }).explanation).toBeUndefined()
  })
})
