import { isHttpError } from "@repo/utils"
import * as Exit from "effect/Exit"
import { describe, expect, it } from "vitest"
import { exitHasOnlyExpectedClientErrors } from "./effect-tracer-client-errors.ts"

const clientError = {
  _tag: "BadRequestError",
  httpStatus: 400,
  httpMessage: "bad request",
}

const serverError = {
  _tag: "RepositoryError",
  httpStatus: 500,
  httpMessage: "internal server error",
}

describe("exitHasOnlyExpectedClientErrors", () => {
  it("returns true for a single 4xx HttpError", () => {
    expect(exitHasOnlyExpectedClientErrors(Exit.fail(clientError))).toBe(true)
  })

  it("returns false for a 5xx HttpError", () => {
    expect(exitHasOnlyExpectedClientErrors(Exit.fail(serverError))).toBe(false)
  })

  it("returns false for success exits", () => {
    expect(exitHasOnlyExpectedClientErrors(Exit.succeed("ok"))).toBe(false)
  })

  it("returns false for plain errors without http metadata", () => {
    expect(exitHasOnlyExpectedClientErrors(Exit.fail(new Error("boom")))).toBe(false)
  })
})

describe("isHttpError", () => {
  it("recognizes domain-style HttpErrors", () => {
    expect(isHttpError(clientError)).toBe(true)
  })
})
