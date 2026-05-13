import { describe, expect, it } from "vitest"
import { adminTriggerClaudeCodeWrappedInputSchema } from "./claude-code-wrapped.functions.ts"

describe("adminTriggerClaudeCodeWrappedInputSchema", () => {
  it("accepts a valid projectId", () => {
    expect(adminTriggerClaudeCodeWrappedInputSchema.safeParse({ projectId: "proj-123" }).success).toBe(true)
  })

  it("rejects an empty projectId", () => {
    expect(adminTriggerClaudeCodeWrappedInputSchema.safeParse({ projectId: "" }).success).toBe(false)
  })

  it("rejects a projectId above the max length", () => {
    expect(adminTriggerClaudeCodeWrappedInputSchema.safeParse({ projectId: "x".repeat(257) }).success).toBe(false)
  })

  it("rejects missing projectId", () => {
    expect(adminTriggerClaudeCodeWrappedInputSchema.safeParse({}).success).toBe(false)
  })
})
