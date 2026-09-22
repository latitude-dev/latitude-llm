import type { AgentScoreWeeklyDigestPayload } from "@domain/notifications"
import { describe, expect, it } from "vitest"
import { buildHeadline, buildSubject, describeCoverage, describeMovement } from "./copy.ts"

const payload = (overrides: Partial<AgentScoreWeeklyDigestPayload> = {}): AgentScoreWeeklyDigestPayload => ({
  projectId: "p".repeat(24),
  date: "2026-09-21",
  windowStart: "2026-09-16",
  windowEnd: "2026-09-22",
  score: 71.4,
  interval: { lower: 68, upper: 74 },
  scoringVersion: "agent-score-v5-provisional",
  windowDays: 7,
  eligibleSessionCount: 1312,
  publishedDayCount: 5,
  dimensions: {
    outcome: { score: 74, delta: null },
    reliability: { score: 81, delta: null },
    cost: { score: 66, delta: null },
    speed: { score: 70, delta: null },
    safety: { score: 92, delta: null },
  },
  comparison: { status: "none" },
  ...overrides,
})

const comparable = (delta: number, significant: boolean): AgentScoreWeeklyDigestPayload["comparison"] => ({
  status: "comparable",
  baselineDate: "2026-09-17",
  baselineScore: 71.4 - delta,
  delta,
  significant,
})

describe("describeMovement", () => {
  it("says there is nothing to compare against on a single published day", () => {
    expect(describeMovement({ status: "none" })).toContain("nothing to compare")
  })

  it("names a real rise", () => {
    expect(describeMovement(comparable(2.5, true))).toBe("Up 2.5 points since Sep 17.")
  })

  it("names a real fall", () => {
    expect(describeMovement(comparable(-3, true))).toBe("Down 3.0 points since Sep 17.")
  })

  it("qualifies a move the intervals do not separate from noise", () => {
    expect(describeMovement(comparable(1.2, false))).toBe(
      "Up 1.2 points since Sep 17, which is within the confidence interval either way.",
    )
  })

  it("uses the singular for exactly one point", () => {
    expect(describeMovement(comparable(1, true))).toBe("Up 1.0 point since Sep 17.")
  })

  it("reports a flat week as unchanged rather than as a zero move", () => {
    expect(describeMovement(comparable(0, false))).toBe("Unchanged since Sep 17.")
  })

  it("explains which comparison was refused", () => {
    expect(
      describeMovement({
        status: "incomparable",
        reason: "scoringVersion",
        baselineDate: "2026-09-17",
        baselineScore: 68,
      }),
    ).toContain("scoring version changed")

    expect(
      describeMovement({
        status: "incomparable",
        reason: "windowDays",
        baselineDate: "2026-09-17",
        baselineScore: 68,
      }),
    ).toContain("scoring window changed length")
  })
})

describe("describeCoverage", () => {
  it("names the published days, the window length and the evidence behind it", () => {
    expect(describeCoverage(payload())).toBe(
      "Scored on 5 of the last 7 days, over a rolling 7-day window of 1,312 sessions.",
    )
  })
})

describe("buildSubject", () => {
  it("leads with the score", () => {
    expect(buildSubject(payload(), "checkout-agent")).toBe("Agent Score 71 for checkout-agent")
  })

  it("appends a move the evidence supports", () => {
    expect(buildSubject(payload({ comparison: comparable(2.5, true) }), "checkout-agent")).toBe(
      "Agent Score 71 for checkout-agent (+2.5 this week)",
    )
  })

  it("leaves a noise-level move out of the subject", () => {
    expect(buildSubject(payload({ comparison: comparable(1.2, false) }), "checkout-agent")).toBe(
      "Agent Score 71 for checkout-agent",
    )
  })

  it("falls back to neutral wording when the project is gone", () => {
    expect(buildSubject(payload(), null)).toBe("Agent Score 71")
    expect(buildHeadline(null)).toBe("Your weekly Agent Score")
  })
})
