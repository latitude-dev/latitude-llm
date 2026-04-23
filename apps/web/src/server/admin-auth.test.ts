import type { User } from "@platform/db-postgres"
import { describe, expect, it } from "vitest"
import { assertAdminUser } from "./admin-auth.ts"

const mkUser = (
  role: string | null | undefined = "user",
  overrides: Partial<User> = {},
): User & { role?: string | null } =>
  ({
    id: "u1",
    email: "someone@example.com",
    name: "Someone",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(overrides as object),
    role,
  }) as User & { role?: string | null }

describe("assertAdminUser", () => {
  it("returns without throwing for role === 'admin'", () => {
    expect(() => assertAdminUser(mkUser("admin"))).not.toThrow()
  })

  it("throws NotFoundError (not UnauthorizedError) for role === 'user'", () => {
    expect(() => assertAdminUser(mkUser("user"))).toThrow(
      expect.objectContaining({
        _tag: "NotFoundError",
        httpStatus: 404,
      }),
    )
  })

  it("throws NotFoundError when role is missing (column not selected / null)", () => {
    expect(() => assertAdminUser(mkUser(null))).toThrow(expect.objectContaining({ _tag: "NotFoundError" }))
    expect(() => assertAdminUser(mkUser(undefined))).toThrow(expect.objectContaining({ _tag: "NotFoundError" }))
  })

  it("throws NotFoundError when user is null", () => {
    expect(() => assertAdminUser(null)).toThrow(expect.objectContaining({ _tag: "NotFoundError" }))
  })

  it("throws NotFoundError when user is undefined", () => {
    expect(() => assertAdminUser(undefined)).toThrow(expect.objectContaining({ _tag: "NotFoundError" }))
  })

  it("uses entity 'Route' and id 'backoffice' so the error does not fingerprint the admin surface", () => {
    try {
      assertAdminUser(mkUser("user"))
    } catch (err) {
      expect(err).toMatchObject({ entity: "Route", id: "backoffice" })
      return
    }
    throw new Error("assertAdminUser did not throw")
  })
})
