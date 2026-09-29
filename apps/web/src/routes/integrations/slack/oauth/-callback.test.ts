import { describe, expect, it } from "vitest"
import { buildPostInstallRedirect } from "./callback.ts"

describe("buildPostInstallRedirect", () => {
  const webUrl = "https://app.example.com"

  it("falls back to /?next=integrations when returnTo is null", () => {
    const response = buildPostInstallRedirect({ returnTo: null, status: "installed=ok", webUrl })
    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe("https://app.example.com/?next=integrations&installed=ok")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("appends status with `&` when returnTo already has a query string", () => {
    const response = buildPostInstallRedirect({
      returnTo: "/projects/acme/onboarding?step=slack",
      status: "installed=ok",
      webUrl,
    })
    expect(response.headers.get("Location")).toBe(
      "https://app.example.com/projects/acme/onboarding?step=slack&installed=ok",
    )
  })

  it("appends status with `?` when returnTo has no query string", () => {
    const response = buildPostInstallRedirect({
      returnTo: "/projects/acme/onboarding",
      status: "installed=ok",
      webUrl,
    })
    expect(response.headers.get("Location")).toBe("https://app.example.com/projects/acme/onboarding?installed=ok")
  })

  it("threads error statuses through unchanged", () => {
    const failed = buildPostInstallRedirect({
      returnTo: null,
      status: "error=oauth_failed",
      webUrl,
    })
    expect(failed.headers.get("Location")).toBe("https://app.example.com/?next=integrations&error=oauth_failed")
  })
})
