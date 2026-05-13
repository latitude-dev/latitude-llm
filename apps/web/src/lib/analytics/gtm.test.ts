import { describe, expect, it } from "vitest"
import { appendTrackingParams, pickTrackingParams, TRACKING_PARAM_KEYS } from "./gtm.ts"

// Mirrors Better Auth's relative-path regex from
// node_modules/better-auth/dist/auth/trusted-origins.mjs (`matchesOriginPattern`).
// The /magic-link/verify endpoint and the social-sign-in `originCheck` middleware
// validate `callbackURL` / `newUserCallbackURL` / `errorCallbackURL` against this
// regex; a non-matching value is rejected with INVALID_CALLBACK_URL.
const BETTER_AUTH_RELATIVE_PATH_REGEX = /^\/(?!\/|\\|%2f|%5c)[\w\-.+/@]*(?:\?[\w\-.+/=&%@]*)?$/

// Simulates Better Auth's processing of a magic-link callback URL:
//   1. Better Auth builds the email link via `url.searchParams.set("newUserCallbackURL", value)`.
//   2. On click, the server URL-parses the query (decodes %XX once).
//   3. The `originCheck` middleware runs `decodeURIComponent` on the parsed value (second decode).
// Validation runs against the result of step 3, so any test that wants to assert
// "this value would survive Better Auth on the wire" must mirror that round-trip.
const simulateBetterAuthValidatedValue = (callbackValue: string): string => {
  const link = new URL("https://example.com/api/auth/magic-link/verify")
  link.searchParams.set("newUserCallbackURL", callbackValue)
  const parsed = new URL(link.toString())
  const raw = parsed.searchParams.get("newUserCallbackURL") ?? ""
  return decodeURIComponent(raw)
}

describe("pickTrackingParams", () => {
  it("includes _gl: its '*' delimiters are escaped by appendTrackingParams to survive Better Auth", () => {
    expect(TRACKING_PARAM_KEYS).toContain("_gl")
    const picked = pickTrackingParams("?_gl=1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5&gclid=abc123")
    expect(picked).toEqual({
      _gl: "1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5",
      gclid: "abc123",
    })
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

  it("leaves regex-safe values untouched (no spurious encoding for typical tracking IDs)", () => {
    const url = appendTrackingParams("/welcome", {
      gclid: "Cj0KCQiAxxxx",
      utm_source: "google",
      utm_campaign: "spring-2026",
      signup: "email",
    })
    expect(url).toBe("/welcome?gclid=Cj0KCQiAxxxx&utm_source=google&utm_campaign=spring-2026&signup=email")
    expect(url).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
  })

  it("survives Better Auth's URL round-trip for typical ad-tracked traffic", () => {
    const tracking = pickTrackingParams(
      "?_gl=1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5&gclid=Cj0KCQiAxxx&utm_source=google&utm_campaign=spring-2026",
    )
    const newUserCallbackURL = appendTrackingParams("/welcome", { ...tracking, signup: "email" })
    expect(simulateBetterAuthValidatedValue(newUserCallbackURL)).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
  })

  it("survives Better Auth's URL round-trip for the social-login start flow", () => {
    const tracking = pickTrackingParams("?fbclid=IwAR0abc&utm_medium=cpc&_gl=1*foo*bar")
    const callbackURL = appendTrackingParams("/", tracking)
    const newUserCallbackURL = appendTrackingParams("/welcome", { ...tracking, signup: "google" })
    const errorCallbackURL = appendTrackingParams("/login", tracking)
    expect(simulateBetterAuthValidatedValue(callbackURL)).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
    expect(simulateBetterAuthValidatedValue(newUserCallbackURL)).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
    expect(simulateBetterAuthValidatedValue(errorCallbackURL)).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
  })

  it("encodes values whose chars Better Auth's regex would reject (defense-in-depth for any future tracking key)", () => {
    // Even if a value somehow contains chars `URLSearchParams.toString()` doesn't
    // encode (`*`) or that the regex disallows after decoding (`(`, `:`, non-ASCII),
    // the validated value must still match the regex.
    const newUserCallbackURL = appendTrackingParams("/welcome", {
      _gl: "1*rre81b*_gcl_au*MTgz",
      utm_source: "spring(2026)",
      utm_term: "café:weekly",
      signup: "email",
    })
    expect(simulateBetterAuthValidatedValue(newUserCallbackURL)).toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
  })

  it("preserves the original tracking value end-to-end after the browser's final decode on /welcome", () => {
    const newUserCallbackURL = appendTrackingParams("/welcome", {
      _gl: "1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5",
      utm_source: "spring(2026)",
      signup: "email",
    })
    const validated = simulateBetterAuthValidatedValue(newUserCallbackURL)
    // After validation, Better Auth redirects to `validated` and the browser
    // does the final URLSearchParams decode on /welcome.
    const finalUrl = new URL(validated, "https://example.com")
    expect(finalUrl.searchParams.get("_gl")).toBe("1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5")
    expect(finalUrl.searchParams.get("utm_source")).toBe("spring(2026)")
    expect(finalUrl.searchParams.get("signup")).toBe("email")
  })

  it("regression guard: the exact production newUserCallbackURL would have been rejected before this fix", () => {
    const productionFailure = "/welcome?_gl=1*rre81b*_gcl_au*MTgzNDAyNDE3My4xNzc4MTU4NDU5&signup=email"
    expect(productionFailure).not.toMatch(BETTER_AUTH_RELATIVE_PATH_REGEX)
  })
})
