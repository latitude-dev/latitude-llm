import { describe, expect, it } from "vitest"
import { parseSignupAttributionCookie, SIGNUP_ATTRIBUTION_COOKIE } from "./signup-attribution-cookie.ts"

describe("parseSignupAttributionCookie", () => {
  it("parses a valid attribution payload", () => {
    const value = encodeURIComponent(JSON.stringify({ sessionId: "sess_1", referrer: "https://latitude.so" }))
    const cookie = `${SIGNUP_ATTRIBUTION_COOKIE}=${value}`
    expect(parseSignupAttributionCookie(cookie)).toEqual({
      sessionId: "sess_1",
      referrer: "https://latitude.so",
    })
  })

  it("returns null for missing or invalid cookies", () => {
    expect(parseSignupAttributionCookie(null)).toBeNull()
    expect(parseSignupAttributionCookie("other=value")).toBeNull()
    expect(parseSignupAttributionCookie(`${SIGNUP_ATTRIBUTION_COOKIE}=not-json`)).toBeNull()
  })
})
