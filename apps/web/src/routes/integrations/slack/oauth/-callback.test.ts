import { SlackIntegrationConflictError } from "@domain/integrations"
import { describe, expect, it } from "vitest"
import { buildPostInstallRedirect, isWorkspaceConflict } from "./callback.ts"

describe("isWorkspaceConflict", () => {
  it("recognises a directly-thrown SlackIntegrationConflictError", () => {
    const error = new SlackIntegrationConflictError({ teamId: "T01ACME" })
    expect(isWorkspaceConflict(error)).toBe(true)
  })

  it("recognises a SlackIntegrationConflictError wrapped in a FiberFailure-shaped cause", () => {
    // Effect.runPromise rejections look like `{ _tag: "FiberFailure", cause: { _tag: "...", ... } }`.
    const wrapped = {
      _tag: "FiberFailure",
      cause: { _tag: "SlackIntegrationConflictError", teamId: "T01ACME" },
    }
    expect(isWorkspaceConflict(wrapped)).toBe(true)
  })

  it("does not match an unrelated error", () => {
    expect(isWorkspaceConflict(new Error("anything else"))).toBe(false)
  })

  it("does not match null / undefined / non-error values", () => {
    expect(isWorkspaceConflict(null)).toBe(false)
    expect(isWorkspaceConflict(undefined)).toBe(false)
    expect(isWorkspaceConflict("string error")).toBe(false)
    expect(isWorkspaceConflict({ cause: { _tag: "SomethingElseError" } })).toBe(false)
  })
})

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
    const taken = buildPostInstallRedirect({
      returnTo: "/projects/acme/onboarding",
      status: "error=workspace_taken",
      webUrl,
    })
    expect(taken.headers.get("Location")).toBe("https://app.example.com/projects/acme/onboarding?error=workspace_taken")

    const failed = buildPostInstallRedirect({
      returnTo: null,
      status: "error=oauth_failed",
      webUrl,
    })
    expect(failed.headers.get("Location")).toBe("https://app.example.com/?next=integrations&error=oauth_failed")
  })
})
