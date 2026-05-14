import { describe, expect, it } from "vitest"
import { buildOAuthCallbackUrls, safeRelativeRedirect } from "./oauth-redirects.ts"

describe("safeRelativeRedirect", () => {
  it("keeps relative redirects and rejects absolute URLs", () => {
    expect(safeRelativeRedirect("/auth/invite?invitationId=abc")).toBe("/auth/invite?invitationId=abc")
    expect(safeRelativeRedirect("https://evil.example/path")).toBe("/")
    expect(safeRelativeRedirect(null)).toBe("/")
  })
})

describe("buildOAuthCallbackUrls", () => {
  it("sends brand new OAuth users back to the invite flow when login started from an invitation", () => {
    const urls = buildOAuthCallbackUrls({
      provider: "google",
      redirect: "/auth/invite?invitationId=invite_123",
      tracking: {},
    })

    expect(urls.callbackURL).toBe("/auth/invite?invitationId=invite_123")
    expect(urls.newUserCallbackURL).toBe("/auth/invite?invitationId=invite_123&signup=google")
    expect(urls.errorCallbackURL).toBe("/login")
  })

  it.each([
    null,
    "https://evil.example/path",
  ])("keeps the regular signup welcome page when OAuth login has no safe redirect: %s", (redirect) => {
    const urls = buildOAuthCallbackUrls({
      provider: "github",
      redirect,
      tracking: { utm_source: "newsletter" },
    })

    expect(urls.callbackURL).toBe("/?utm_source=newsletter")
    expect(urls.newUserCallbackURL).toBe("/welcome?utm_source=newsletter&signup=github")
    expect(urls.errorCallbackURL).toBe("/login?utm_source=newsletter")
  })
})
