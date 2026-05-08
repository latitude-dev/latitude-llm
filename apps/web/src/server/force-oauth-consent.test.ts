import { describe, expect, it } from "vitest"
import { forceOAuthConsent } from "./force-oauth-consent.ts"

const authorizeUrl = "https://app.example.com/api/auth/mcp/authorize"

describe("forceOAuthConsent", () => {
  it("adds `prompt=consent` to a GET request to /api/auth/mcp/authorize", () => {
    const request = new Request(`${authorizeUrl}?client_id=abc&response_type=code`)
    const rewritten = forceOAuthConsent(request)
    expect(rewritten).not.toBe(request)
    expect(new URL(rewritten.url).searchParams.get("prompt")).toBe("consent")
  })

  it("preserves all other query params", () => {
    const original = new URL(authorizeUrl)
    original.searchParams.set("client_id", "abc")
    original.searchParams.set("response_type", "code")
    original.searchParams.set("redirect_uri", "http://localhost:9999/callback")
    original.searchParams.set("scope", "openid profile")
    original.searchParams.set("state", "xyz")
    original.searchParams.set("code_challenge", "challenge-value")
    original.searchParams.set("code_challenge_method", "S256")

    const rewritten = forceOAuthConsent(new Request(original.toString()))
    const out = new URL(rewritten.url).searchParams

    expect(out.get("client_id")).toBe("abc")
    expect(out.get("response_type")).toBe("code")
    expect(out.get("redirect_uri")).toBe("http://localhost:9999/callback")
    expect(out.get("scope")).toBe("openid profile")
    expect(out.get("state")).toBe("xyz")
    expect(out.get("code_challenge")).toBe("challenge-value")
    expect(out.get("code_challenge_method")).toBe("S256")
    expect(out.get("prompt")).toBe("consent")
  })

  it("is idempotent when prompt=consent is already set", () => {
    const request = new Request(`${authorizeUrl}?client_id=abc&prompt=consent`)
    const rewritten = forceOAuthConsent(request)
    expect(rewritten).toBe(request)
  })

  it("overrides a non-consent prompt value (e.g. prompt=none)", () => {
    // `prompt=none` would tell BA to fail the request rather than render UI.
    // Forcing `consent` instead is intentional — we need the org-binding step
    // for tokens to be usable.
    const request = new Request(`${authorizeUrl}?client_id=abc&prompt=none`)
    const rewritten = forceOAuthConsent(request)
    expect(new URL(rewritten.url).searchParams.get("prompt")).toBe("consent")
  })

  it("preserves the request method (always GET for authorize, asserted explicitly)", () => {
    const request = new Request(`${authorizeUrl}?client_id=abc`)
    const rewritten = forceOAuthConsent(request)
    expect(rewritten.method).toBe("GET")
  })

  it("passes through requests for non-authorize URLs untouched", () => {
    const request = new Request("https://app.example.com/api/auth/get-session")
    const rewritten = forceOAuthConsent(request)
    expect(rewritten).toBe(request)
  })

  it("passes through POST requests untouched", () => {
    // `mcp/authorize` is GET-only; a POST to that URL is somebody else's
    // problem, and we shouldn't be silently rewriting it.
    const request = new Request(authorizeUrl, { method: "POST" })
    const rewritten = forceOAuthConsent(request)
    expect(rewritten).toBe(request)
  })

  it("passes through requests for /api/auth/oauth2/authorize (the standard OIDC endpoint)", () => {
    // The standard OIDC authorize endpoint already honours `oauth_consents` +
    // `consentPage` — it doesn't need our forced prompt. Rewriting it would
    // also hit the `prompt=none` path, which legitimately means "fail without
    // UI" for some clients.
    const request = new Request("https://app.example.com/api/auth/oauth2/authorize?client_id=abc")
    const rewritten = forceOAuthConsent(request)
    expect(rewritten).toBe(request)
  })
})
