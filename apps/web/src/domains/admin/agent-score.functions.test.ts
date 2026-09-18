import { describe, expect, it } from "vitest"
import { adminAgentScoreProjectInputSchema } from "./agent-score.functions.ts"

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
