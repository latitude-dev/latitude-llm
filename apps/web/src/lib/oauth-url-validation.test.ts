import { describe, expect, it } from "vitest"
import {
  isSafeOAuthIconUrl,
  isSafeOAuthRedirectUrl,
  validateOAuthClientRegistrationMetadata,
} from "./oauth-url-validation.ts"

describe("OAuth URL validation", () => {
  it("allows http and https icon URLs", () => {
    expect(isSafeOAuthIconUrl("https://example.com/logo.png")).toBe(true)
    expect(isSafeOAuthIconUrl("http://example.com/logo.png")).toBe(true)
  })

  it("rejects executable or embedded icon URL schemes", () => {
    expect(isSafeOAuthIconUrl("data:image/svg+xml,<svg onload=alert(1) />")).toBe(false)
    expect(isSafeOAuthIconUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeOAuthIconUrl("vbscript:msgbox(1)")).toBe(false)
    expect(isSafeOAuthIconUrl("/relative/logo.png")).toBe(false)
  })

  it("allows https redirect URLs and loopback http redirect URLs", () => {
    expect(isSafeOAuthRedirectUrl("https://client.example.com/callback?code=123")).toBe(true)
    expect(isSafeOAuthRedirectUrl("http://localhost:3917/callback")).toBe(true)
    expect(isSafeOAuthRedirectUrl("http://127.0.0.1:3917/callback")).toBe(true)
    expect(isSafeOAuthRedirectUrl("http://[::1]:3917/callback")).toBe(true)
  })

  it("rejects non-loopback http and executable redirect URL schemes", () => {
    expect(isSafeOAuthRedirectUrl("http://client.example.com/callback")).toBe(false)
    expect(isSafeOAuthRedirectUrl("http://127.999.999.999/callback")).toBe(false)
    expect(isSafeOAuthRedirectUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeOAuthRedirectUrl("data:text/html,<script>alert(1)</script>")).toBe(false)
    expect(isSafeOAuthRedirectUrl("vbscript:msgbox(1)")).toBe(false)
    expect(isSafeOAuthRedirectUrl("//client.example.com/callback")).toBe(false)
  })

  it("rejects credentials in URLs", () => {
    expect(isSafeOAuthIconUrl("https://user:pass@example.com/logo.png")).toBe(false)
    expect(isSafeOAuthRedirectUrl("https://user:pass@example.com/callback")).toBe(false)
  })

  it("validates dynamic client registration metadata", () => {
    expect(
      validateOAuthClientRegistrationMetadata({
        redirect_uris: ["https://client.example.com/callback", "http://localhost:3917/callback"],
        logo_uri: "https://client.example.com/logo.png",
      }),
    ).toBeNull()

    expect(
      validateOAuthClientRegistrationMetadata({
        redirect_uris: ["javascript:alert(1)"],
      }),
    ).toBe("redirect_uris must use HTTPS or loopback HTTP URLs")

    expect(
      validateOAuthClientRegistrationMetadata({
        redirect_uris: ["https://client.example.com/callback"],
        logo_uri: "data:image/svg+xml,<svg onload=alert(1) />",
      }),
    ).toBe("logo_uri must use an HTTP or HTTPS URL")
  })
})
