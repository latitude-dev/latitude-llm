import { describe, expect, it } from "vitest"
import { adminBackfillConversationIntelligenceInputSchema } from "./conversation-intelligence.functions.ts"

describe("adminBackfillConversationIntelligenceInputSchema", () => {
  it("accepts a valid projectId and exact confirmation phrase", () => {
    expect(
      adminBackfillConversationIntelligenceInputSchema.safeParse({
        projectId: "proj-123",
        confirmation: "reset conversation intelligence",
      }).success,
    ).toBe(true)
  })

  it("rejects an empty projectId", () => {
    expect(
      adminBackfillConversationIntelligenceInputSchema.safeParse({
        projectId: "",
        confirmation: "reset conversation intelligence",
      }).success,
    ).toBe(false)
  })

  it("rejects a projectId above the max length", () => {
    expect(
      adminBackfillConversationIntelligenceInputSchema.safeParse({
        projectId: "x".repeat(257),
        confirmation: "reset conversation intelligence",
      }).success,
    ).toBe(false)
  })

  it("rejects missing confirmation", () => {
    expect(adminBackfillConversationIntelligenceInputSchema.safeParse({ projectId: "proj-123" }).success).toBe(false)
  })

  it("rejects a different confirmation phrase", () => {
    expect(
      adminBackfillConversationIntelligenceInputSchema.safeParse({
        projectId: "proj-123",
        confirmation: "backfill",
      }).success,
    ).toBe(false)
  })
})
