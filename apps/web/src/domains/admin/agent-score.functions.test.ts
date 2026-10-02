import { SEED_AGENT_SCORE_HISTORY_DAYS } from "@domain/admin"
import { describe, expect, it } from "vitest"
import {
  AGENT_SCORE_SEED_HISTORY_DAYS,
  adminAgentScoreProjectInputSchema,
  adminSeedAgentScoreHistoryInputSchema,
  agentScoreRecalculationDates,
  SEED_AGENT_SCORE_HISTORY_CONFIRMATION,
} from "./agent-score.functions.ts"

describe("adminAgentScoreProjectInputSchema", () => {
  it("accepts a project id", () => {
    expect(adminAgentScoreProjectInputSchema.parse({ projectId: "p".repeat(24) })).toEqual({
      projectId: "p".repeat(24),
    })
  })

  it("rejects an empty project id", () => {
    expect(adminAgentScoreProjectInputSchema.safeParse({ projectId: "" }).success).toBe(false)
  })

  it("rejects an over-long project id rather than passing it to a lookup", () => {
    expect(adminAgentScoreProjectInputSchema.safeParse({ projectId: "p".repeat(257) }).success).toBe(false)
  })

  it("takes no organization from the caller, so a request cannot name another tenant", () => {
    const parsed = adminAgentScoreProjectInputSchema.parse({
      projectId: "p".repeat(24),
      organizationId: "o".repeat(24),
    })

    expect(parsed).not.toHaveProperty("organizationId")
  })
})

describe("agentScoreRecalculationDates", () => {
  it("recalculates today and the older displayed snapshot", () => {
    expect(
      agentScoreRecalculationDates({
        currentDate: "2026-09-18",
        snapshotDate: "2026-09-17",
      }),
    ).toEqual(["2026-09-18", "2026-09-17"])
  })

  it("does not enqueue today twice when it is the displayed snapshot", () => {
    expect(
      agentScoreRecalculationDates({
        currentDate: "2026-09-18",
        snapshotDate: "2026-09-18",
      }),
    ).toEqual(["2026-09-18"])
  })

  it("only recalculates today when no snapshot has been published", () => {
    expect(
      agentScoreRecalculationDates({
        currentDate: "2026-09-18",
        snapshotDate: null,
      }),
    ).toEqual(["2026-09-18"])
  })
})

describe("adminSeedAgentScoreHistoryInputSchema", () => {
  const valid = {
    projectId: "p".repeat(24),
    confirmation: SEED_AGENT_SCORE_HISTORY_CONFIRMATION,
    days: [{ date: "2026-09-17", score: 74.4 }],
  }

  it("accepts a confirmed range of dated scores", () => {
    expect(adminSeedAgentScoreHistoryInputSchema.parse(valid)).toEqual(valid)
  })

  it("requires the confirmation phrase, so the range cannot be posted by accident", () => {
    expect(adminSeedAgentScoreHistoryInputSchema.safeParse({ ...valid, confirmation: "yes" }).success).toBe(false)
  })

  it("rejects scores outside the published range", () => {
    for (const score of [-0.1, 100.1]) {
      expect(
        adminSeedAgentScoreHistoryInputSchema.safeParse({ ...valid, days: [{ date: "2026-09-17", score }] }).success,
      ).toBe(false)
    }
  })

  it("accepts decimals, which is the point of dragging a slider", () => {
    expect(
      adminSeedAgentScoreHistoryInputSchema.safeParse({ ...valid, days: [{ date: "2026-09-17", score: 74.4 }] })
        .success,
    ).toBe(true)
  })

  it("rejects dates that are not plain UTC days", () => {
    for (const date of ["2026-9-17", "2026-09-17T00:00:00Z", "yesterday", ""]) {
      expect(adminSeedAgentScoreHistoryInputSchema.safeParse({ ...valid, days: [{ date, score: 70 }] }).success).toBe(
        false,
      )
    }
  })

  it("rejects a repeated date rather than reporting a count that describes neither request nor result", () => {
    expect(
      adminSeedAgentScoreHistoryInputSchema.safeParse({
        ...valid,
        days: [
          { date: "2026-09-17", score: 70 },
          { date: "2026-09-17", score: 80 },
        ],
      }).success,
    ).toBe(false)
  })

  it("refuses an empty range and one longer than the offered window", () => {
    expect(adminSeedAgentScoreHistoryInputSchema.safeParse({ ...valid, days: [] }).success).toBe(false)
    const tooMany = Array.from({ length: AGENT_SCORE_SEED_HISTORY_DAYS + 1 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      score: 70,
    }))
    expect(adminSeedAgentScoreHistoryInputSchema.safeParse({ ...valid, days: tooMany }).success).toBe(false)
  })

  it("offers the same window the use case will actually accept", () => {
    // The literal stays here so the modal can import it without pulling `@domain/admin` into the
    // browser bundle; the rule itself lives in the use case, and drift between them would mean the
    // modal offering days the server rejects.
    expect(AGENT_SCORE_SEED_HISTORY_DAYS).toBe(SEED_AGENT_SCORE_HISTORY_DAYS)
  })

  it("takes no organization from the caller", () => {
    expect(
      adminSeedAgentScoreHistoryInputSchema.parse({ ...valid, organizationId: "o".repeat(24) }),
    ).not.toHaveProperty("organizationId")
  })
})
