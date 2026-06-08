import { describe, expect, it } from "vitest"
import { adminBackfillSessionIntelligenceInputSchema } from "./session-intelligence.functions.ts"

describe("adminBackfillSessionIntelligenceInputSchema", () => {
  it("accepts a valid projectId and exact confirmation phrase", () => {
    expect(
      adminBackfillSessionIntelligenceInputSchema.safeParse({
        projectId: "proj-123",
        confirmation: "reset session intelligence",
      }).success,
    ).toBe(true)
  })

  it("rejects an empty projectId", () => {
    expect(
      adminBackfillSessionIntelligenceInputSchema.safeParse({
        projectId: "",
        confirmation: "reset session intelligence",
      }).success,
    ).toBe(false)
  })

  it("rejects a projectId above the max length", () => {
    expect(
      adminBackfillSessionIntelligenceInputSchema.safeParse({
        projectId: "x".repeat(257),
        confirmation: "reset session intelligence",
      }).success,
    ).toBe(false)
  })

  it("rejects missing confirmation", () => {
    expect(adminBackfillSessionIntelligenceInputSchema.safeParse({ projectId: "proj-123" }).success).toBe(false)
  })

  it("rejects a different confirmation phrase", () => {
    expect(
      adminBackfillSessionIntelligenceInputSchema.safeParse({
        projectId: "proj-123",
        confirmation: "backfill",
      }).success,
    ).toBe(false)
  })
})
