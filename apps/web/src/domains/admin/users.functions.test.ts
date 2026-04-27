import { describe, expect, it } from "vitest"
import {
  adminChangeUserEmailInputSchema,
  adminGetUserInputSchema,
  adminRevokeUserSessionInputSchema,
  adminRevokeUserSessionsInputSchema,
  adminSetUserRoleInputSchema,
} from "./users.functions.ts"

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

describe("adminChangeUserEmailInputSchema", () => {
  it("accepts a valid email", () => {
    const result = adminChangeUserEmailInputSchema.safeParse({ userId: "user-123", newEmail: "user@example.com" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newEmail).toBe("user@example.com")
    }
  })

  it("trims and lowercases the new email so audit events stay normalized", () => {
    const result = adminChangeUserEmailInputSchema.safeParse({
      userId: "user-123",
      newEmail: "  Mixed.Case@Example.COM  ",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newEmail).toBe("mixed.case@example.com")
    }
  })

  it("rejects malformed emails", () => {
    expect(adminChangeUserEmailInputSchema.safeParse({ userId: "user-123", newEmail: "not-an-email" }).success).toBe(
      false,
    )
  })

  it("rejects a missing email", () => {
    expect(adminChangeUserEmailInputSchema.safeParse({ userId: "user-123" }).success).toBe(false)
  })

  it("rejects an absurdly long email (defensive bound against abuse)", () => {
    const longEmail = `${"x".repeat(320)}@example.com`
    expect(adminChangeUserEmailInputSchema.safeParse({ userId: "user-123", newEmail: longEmail }).success).toBe(false)
  })

  it("rejects an empty userId", () => {
    expect(adminChangeUserEmailInputSchema.safeParse({ userId: "", newEmail: "user@example.com" }).success).toBe(false)
  })
})

describe("adminRevokeUserSessionsInputSchema", () => {
  it("accepts a valid userId", () => {
    expect(adminRevokeUserSessionsInputSchema.safeParse({ userId: "user-123" }).success).toBe(true)
  })

  it("rejects an empty userId", () => {
    expect(adminRevokeUserSessionsInputSchema.safeParse({ userId: "" }).success).toBe(false)
  })

  it("rejects a userId above the max length", () => {
    expect(adminRevokeUserSessionsInputSchema.safeParse({ userId: "x".repeat(257) }).success).toBe(false)
  })
})

describe("adminRevokeUserSessionInputSchema", () => {
  const validInput = { userId: "user-123", sessionId: "sess-abc", sessionToken: "tok-xyz" }

  it("accepts a valid input", () => {
    expect(adminRevokeUserSessionInputSchema.safeParse(validInput).success).toBe(true)
  })

  it("rejects when sessionId is missing — needed for the audit-event identifier", () => {
    expect(adminRevokeUserSessionInputSchema.safeParse({ ...validInput, sessionId: undefined }).success).toBe(false)
  })

  it("rejects when sessionToken is missing — needed for the actual revoke call", () => {
    expect(adminRevokeUserSessionInputSchema.safeParse({ ...validInput, sessionToken: "" }).success).toBe(false)
  })

  it("rejects an absurdly long token (defensive bound against abuse)", () => {
    expect(adminRevokeUserSessionInputSchema.safeParse({ ...validInput, sessionToken: "x".repeat(2049) }).success).toBe(
      false,
    )
  })
})
