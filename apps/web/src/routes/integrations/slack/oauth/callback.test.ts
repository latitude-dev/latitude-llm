import { SlackIntegrationConflictError } from "@domain/integrations"
import { describe, expect, it } from "vitest"
import { isWorkspaceConflict } from "./callback.ts"

describe("isWorkspaceConflict", () => {
  it("recognises a directly-thrown SlackIntegrationConflictError", () => {
    const error = new SlackIntegrationConflictError({ teamId: "T01ACME" })
    expect(isWorkspaceConflict(error)).toBe(true)
  })

  it("recognises a SlackIntegrationConflictError wrapped in a FiberFailure-shaped cause", () => {
    // Effect.runPromise rejections look like `{ _tag: "FiberFailure", cause: { _tag: "...", ... } }`.
    const wrapped = {
      _tag: "FiberFailure",
      cause: { _tag: "SlackIntegrationConflictError", teamId: "T01ACME" },
    }
    expect(isWorkspaceConflict(wrapped)).toBe(true)
  })

  it("does not match an unrelated error", () => {
    expect(isWorkspaceConflict(new Error("anything else"))).toBe(false)
  })

  it("does not match null / undefined / non-error values", () => {
    expect(isWorkspaceConflict(null)).toBe(false)
    expect(isWorkspaceConflict(undefined)).toBe(false)
    expect(isWorkspaceConflict("string error")).toBe(false)
    expect(isWorkspaceConflict({ cause: { _tag: "SomethingElseError" } })).toBe(false)
  })
})
