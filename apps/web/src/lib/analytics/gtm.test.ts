import { describe, expect, it } from "vitest"
import { appendTrackingParams, pickTrackingParams, TRACKING_PARAM_KEYS } from "./gtm.ts"

// Mirrors Better Auth's relative-path regex from
// node_modules/better-auth/dist/auth/trusted-origins.mjs (`matchesOriginPattern`).
// The /magic-link/verify endpoint and the social-sign-in `originCheck` middleware
// validate `callbackURL` / `newUserCallbackURL` / `errorCallbackURL` against this
// regex; a non-matching value is rejected with INVALID_CALLBACK_URL.
const BETTER_AUTH_RELATIVE_PATH_REGEX = /^\/(?!\/|\\|%2f|%5c)[\w\-.+/@]*(?:\?[\w\-.+/=&%@]*)?$/

describe("pickTrackingParams", () => {
  it("excludes _gl since its '*' delimiters fail Better Auth's callbackURL regex", () => {
    expect(TRACKING_PARAM_KEYS).not.toContain("_gl")
    const picked = pickTrackingParams("?_gl=1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5&gclid=abc123")
    expect(picked).not.toHaveProperty("_gl")
    expect(picked).toEqual({ gclid: "abc123" })
  })

  it("collects supported tracking keys and ignores unrelated ones", () => {
    const picked = pickTrackingParams("?gclid=abc&fbclid=xyz&utm_source=newsletter&unrelated=value")
    expect(picked).toEqual({
      gclid: "abc",
      fbclid: "xyz",
      utm_source: "newsletter",
    })
  })

  it("returns an empty object when no tracking params are present", () => {
    expect(pickTrackingParams("")).toEqual({})
  })

  it("accepts both URLSearchParams and raw strings", () => {
    const fromString = pickTrackingParams("?gclid=abc")
    const fromParams = pickTrackingParams(new URLSearchParams("gclid=abc"))
    expect(fromString).toEqual(fromParams)
  })
})

describe("appendTrackingParams", () => {
  it("returns the path unchanged when no params are provided", () => {
    expect(appendTrackingParams("/welcome", {})).toBe("/welcome")
  })

  it("uses '?' when path has no query and '&' when it already does", () => {
    expect(appendTrackingParams("/welcome", { signup: "email" })).toBe("/welcome?signup=email")
    expect(appendTrackingParams("/welcome?foo=1", { signup: "email" })).toBe("/welcome?foo=1&signup=email")
  })

  it("produces a URL that passes Better Auth's relative-path regex for the email magic-link signup flow", () => {
    // Reproduces the production failure: a user landed on /login with a Google-Ads
    // `_gl` linker param. Now that `_gl` is dropped, the resulting newUserCallbackURL
    // must match Better Auth's regex.
    const tracking = pickTrackingParams(
      "?_gl=1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5&gclid=Cj0KCQiAxxx&utm_source=google&utm_campaign=spring-2026",
    )
    const newUserCallbackURL = appendTrackingParams("/welcome", { ...tracking, signup: "email" })
    expect(newUserCallbackURL).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
  })

  it("produces URLs that pass Better Auth's relative-path regex for the social-login start flow", () => {
    const tracking = pickTrackingParams("?fbclid=IwAR0abc&utm_medium=cpc&_gl=1*foo*bar")
    const callbackURL = appendTrackingParams("/", tracking)
    const newUserCallbackURL = appendTrackingParams("/welcome", { ...tracking, signup: "google" })
    const errorCallbackURL = appendTrackingParams("/login", tracking)
    expect(callbackURL).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
    expect(newUserCallbackURL).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
    expect(errorCallbackURL).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
  })

  it("regression guard: the exact production newUserCallbackURL would have been rejected before this fix", () => {
    // The literal value from the failing magic link in production
    // (https://console.latitude.so/api/auth/magic-link/verify?...&newUserCallbackURL=...).
    const productionFailure = "/welcome?_gl=1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5&signup=email"
    expect(productionFailure).not.toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
  })
})
