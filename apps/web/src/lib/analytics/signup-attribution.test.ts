import { describe, expect, it } from "vitest"
import { signupAttributionKey, toMarketingAttribution } from "./signup-attribution.ts"

describe("signupAttributionKey", () => {
  it("lower-cases the email so lookups match regardless of casing", () => {
    expect(signupAttributionKey("Foo@Bar.com")).toBe("signup-attr:foo@bar.com")
  })
})

describe("toMarketingAttribution", () => {
  it("maps session + referrer to PostHog property names", () => {
    expect(toMarketingAttribution({ sessionId: "sess_1", referrer: "https://latitude.so/pricing" })).toEqual({
      $session_id: "sess_1",
      $referrer: "https://latitude.so/pricing",
    })
  })

  it("forwards whitelisted UTM / click-id params and drops the rest", () => {
    const result = toMarketingAttribution({
      trackingParams: {
        utm_source: "google",
        utm_medium: "cpc",
        gclid: "abc",
        // GTM-internal keys must not leak into PostHog properties.
        _gl: "x",
        baker_anon_id: "y",
      },
    })

    expect(result).toEqual({ utm_source: "google", utm_medium: "cpc", gclid: "abc" })
  })

  it("omits empty fields rather than emitting empty strings", () => {
    expect(toMarketingAttribution({ sessionId: "", trackingParams: {} })).toEqual({})
  })
})
