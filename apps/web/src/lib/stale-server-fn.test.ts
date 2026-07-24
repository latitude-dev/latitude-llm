import { describe, expect, it } from "vitest"
import { isMissingServerFnError, isMissingServerFnErrorMessage } from "./stale-server-fn.ts"

describe("isMissingServerFnErrorMessage", () => {
  it("matches TanStack's unknown server-fn hash message", () => {
    expect(
      isMissingServerFnErrorMessage(
        "Server function info not found for 8ae8498b6e8c600abff6cc7c428fc166b1bb45613094b806f08105bfc6f1344d",
      ),
    ).toBe(true)
  })

  it("rejects unrelated messages", () => {
    expect(isMissingServerFnErrorMessage("boom")).toBe(false)
    expect(isMissingServerFnErrorMessage("Server function info not found for not-a-hash")).toBe(false)
  })
})

describe("isMissingServerFnError", () => {
  it("requires an Error with the matching message", () => {
    expect(
      isMissingServerFnError(
        new Error(
          "Server function info not found for 8ae8498b6e8c600abff6cc7c428fc166b1bb45613094b806f08105bfc6f1344d",
        ),
      ),
    ).toBe(true)
    expect(isMissingServerFnError("Server function info not found for abc")).toBe(false)
  })
})
