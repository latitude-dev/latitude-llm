import { describe, expect, it } from "vitest"
import { adminRecalculateAgentScoreInputSchema } from "./agent-score.functions.ts"

describe("adminRecalculateAgentScoreInputSchema", () => {
  it("accepts a project id", () => {
    expect(adminRecalculateAgentScoreInputSchema.parse({ projectId: "p".repeat(24) })).toEqual({
      projectId: "p".repeat(24),
    })
  })

  it("rejects an empty project id", () => {
    expect(adminRecalculateAgentScoreInputSchema.safeParse({ projectId: "" }).success).toBe(false)
  })

  it("rejects an over-long project id rather than passing it to a lookup", () => {
    expect(adminRecalculateAgentScoreInputSchema.safeParse({ projectId: "p".repeat(257) }).success).toBe(false)
  })

  it("takes no organization from the caller, so a request cannot name another tenant", () => {
    const parsed = adminRecalculateAgentScoreInputSchema.parse({
      projectId: "p".repeat(24),
      organizationId: "o".repeat(24),
    })

    expect(parsed).not.toHaveProperty("organizationId")
  })
})
