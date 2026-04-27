import { describe, expect, it } from "vitest"
import { adminGetUserInputSchema } from "./users.functions.ts"

describe("adminGetUserInputSchema", () => {
  it("accepts a valid userId", () => {
    const result = adminGetUserInputSchema.safeParse({ userId: "user-123" })
    expect(result.success).toBe(true)
  })

  it("rejects an empty userId", () => {
    expect(adminGetUserInputSchema.safeParse({ userId: "" }).success).toBe(false)
  })

  it("rejects a userId above the max length (defensive bound against abuse)", () => {
    expect(adminGetUserInputSchema.safeParse({ userId: "x".repeat(257) }).success).toBe(false)
  })

  it("rejects missing userId", () => {
    expect(adminGetUserInputSchema.safeParse({}).success).toBe(false)
  })
})
