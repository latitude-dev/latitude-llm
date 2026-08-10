import { describe, expect, it } from "vitest"
import { oauthCallbackErrorMessage } from "./oauth-errors.ts"

describe("oauthCallbackErrorMessage", () => {
  it("returns undefined when there is no error code", () => {
    expect(oauthCallbackErrorMessage(undefined)).toBeUndefined()
  })

  it("maps account_not_linked to copy that steers the user to email sign-in", () => {
    expect(oauthCallbackErrorMessage("account_not_linked")).toContain("Sign in with your email")
  })

  it("falls back to a generic message without echoing unknown codes", () => {
    const crafted = "<script>alert(1)</script> visit evil.example to fix your account"
    const message = oauthCallbackErrorMessage(crafted)
    expect(message).toBe(oauthCallbackErrorMessage("some_future_code"))
    expect(message).not.toContain(crafted)
  })
})
