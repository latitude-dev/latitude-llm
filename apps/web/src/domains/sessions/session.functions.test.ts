import { UnauthorizedError } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { assertAuthenticatedSession } from "./session.functions.ts"

describe("assertAuthenticatedSession", () => {
  it("does not throw when session is present", () => {
    expect(() => assertAuthenticatedSession({ user: { id: "u1" } })).not.toThrow()
  })

  it("throws UnauthorizedError when session is null", () => {
    expect(() => assertAuthenticatedSession(null)).toThrow(
      expect.objectContaining({
        _tag: "UnauthorizedError",
        message: "Unauthorized",
        httpStatus: 401,
      }),
    )
  })

  it("throws UnauthorizedError when session is undefined", () => {
    expect(() => assertAuthenticatedSession(undefined)).toThrow(UnauthorizedError)
  })
})
