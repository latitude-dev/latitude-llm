import { describe, expect, it } from "vitest"
import { adminGetUserInputSchema, adminSetUserRoleInputSchema } from "./users.functions.ts"

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

describe("adminSetUserRoleInputSchema", () => {
  it("accepts a valid user→admin transition", () => {
    expect(adminSetUserRoleInputSchema.safeParse({ userId: "user-123", role: "admin" }).success).toBe(true)
  })

  it("accepts a valid admin→user transition", () => {
    expect(adminSetUserRoleInputSchema.safeParse({ userId: "user-123", role: "user" }).success).toBe(true)
  })

  it("rejects an unknown role (closed enum prevents typo'd writes from Better Auth)", () => {
    expect(adminSetUserRoleInputSchema.safeParse({ userId: "user-123", role: "owner" }).success).toBe(false)
  })

  it("rejects a missing role", () => {
    expect(adminSetUserRoleInputSchema.safeParse({ userId: "user-123" }).success).toBe(false)
  })

  it("rejects an empty userId", () => {
    expect(adminSetUserRoleInputSchema.safeParse({ userId: "", role: "admin" }).success).toBe(false)
  })

  it("rejects a userId above the max length", () => {
    expect(adminSetUserRoleInputSchema.safeParse({ userId: "x".repeat(257), role: "admin" }).success).toBe(false)
  })
})
