import { describe, expect, it } from "vitest"
import { adminTriggerWrappedInputSchema } from "./wrapped.functions.ts"

describe("adminTriggerWrappedInputSchema", () => {
  it("accepts a valid projectId (type defaults to claude_code)", () => {
    const result = adminTriggerWrappedInputSchema.safeParse({ projectId: "proj-123" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.type).toBe("claude_code")
  })

  it("accepts an explicit type", () => {
    expect(adminTriggerWrappedInputSchema.safeParse({ projectId: "proj-123", type: "claude_code" }).success).toBe(true)
  })

  it("rejects an empty projectId", () => {
    expect(adminTriggerWrappedInputSchema.safeParse({ projectId: "" }).success).toBe(false)
  })

  it("rejects a projectId above the max length", () => {
    expect(adminTriggerWrappedInputSchema.safeParse({ projectId: "x".repeat(257) }).success).toBe(false)
  })

  it("rejects missing projectId", () => {
    expect(adminTriggerWrappedInputSchema.safeParse({}).success).toBe(false)
  })

  it("rejects an unknown type", () => {
    expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately test runtime rejection
      adminTriggerWrappedInputSchema.safeParse({ projectId: "proj-123", type: "openclaw" as any }).success,
    ).toBe(false)
  })
})
