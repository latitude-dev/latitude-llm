import { afterEach, describe, expect, it, vi } from "vitest"
import {
  parseSignupAttributionCookie,
  SIGNUP_ATTRIBUTION_COOKIE,
  setSignupAttributionCookie,
} from "./signup-attribution-cookie.ts"

const stubBrowser = (hostname: string) => {
  const documentStub = { cookie: "" }
  vi.stubGlobal("window", { location: { hostname } })
  vi.stubGlobal("document", documentStub)
  return documentStub
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("parseSignupAttributionCookie", () => {
  it("parses a valid attribution payload", () => {
    const value = encodeURIComponent(JSON.stringify({ sessionId: "sess_1", referrer: "https://latitude.so" }))
    const cookie = `other=value; ${SIGNUP_ATTRIBUTION_COOKIE}=${value}`
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

describe("setSignupAttributionCookie", () => {
  it("writes the attribution cookie without a domain on localhost", () => {
    const documentStub = stubBrowser("localhost")

    setSignupAttributionCookie({ sessionId: "sess_1" })

    expect(documentStub.cookie).toContain(`${SIGNUP_ATTRIBUTION_COOKIE}=`)
    expect(documentStub.cookie).toContain("path=/")
    expect(documentStub.cookie).toContain("samesite=lax")
    expect(documentStub.cookie).toContain("secure")
    expect(documentStub.cookie).not.toContain("domain=")
  })

  it("writes the attribution cookie for the shared latitude.so domain", () => {
    const documentStub = stubBrowser("console.latitude.so")

    setSignupAttributionCookie({ sessionId: "sess_1" })

    expect(documentStub.cookie).toContain("domain=.latitude.so")
  })

  it("skips writing empty or invalid attribution", () => {
    const documentStub = stubBrowser("console.latitude.so")

    setSignupAttributionCookie({})
    setSignupAttributionCookie({ sessionId: 123 } as never)

    expect(documentStub.cookie).toBe("")
  })
})
