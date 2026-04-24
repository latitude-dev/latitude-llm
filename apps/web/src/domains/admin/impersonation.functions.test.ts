import { describe, expect, it } from "vitest"
import { impersonateUserInputSchema } from "./impersonation.functions.ts"

describe("impersonateUserInputSchema", () => {
  it("accepts a valid userId", () => {
    expect(impersonateUserInputSchema.safeParse({ userId: "user-123" }).success).toBe(true)
  })

  it("rejects an empty userId", () => {
    expect(impersonateUserInputSchema.safeParse({ userId: "" }).success).toBe(false)
  })

  it("rejects a userId above the max length (defensive bound against abuse)", () => {
    expect(impersonateUserInputSchema.safeParse({ userId: "x".repeat(257) }).success).toBe(false)
  })

  it("rejects missing userId", () => {
    expect(impersonateUserInputSchema.safeParse({}).success).toBe(false)
  })
})
