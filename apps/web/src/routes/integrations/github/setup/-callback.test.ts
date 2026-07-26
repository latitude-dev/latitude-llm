import { GithubIntegrationConflictError } from "@domain/github"
import { describe, expect, it } from "vitest"
import { buildGithubPostInstallRedirect, isGithubInstallationConflict } from "./callback.ts"

const WEB_URL = "https://console.latitude.so"

describe("buildGithubPostInstallRedirect", () => {
  it("302s to the settings landing with the success flash", () => {
    const response = buildGithubPostInstallRedirect({ status: "githubInstalled=ok", webUrl: WEB_URL })
    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe(`${WEB_URL}/?next=integrations&githubInstalled=ok`)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("carries the pending-approval and each error flash", () => {
    for (const status of [
      "githubPending=approval",
      "githubError=installation_taken",
      "githubError=verification_failed",
      "githubError=oauth_failed",
    ] as const) {
      const response = buildGithubPostInstallRedirect({ status, webUrl: WEB_URL })
      expect(response.headers.get("Location")).toBe(`${WEB_URL}/?next=integrations&${status}`)
    }
  })
})

describe("isGithubInstallationConflict", () => {
  it("recognizes a direct conflict error", () => {
    expect(isGithubInstallationConflict(new GithubIntegrationConflictError({ installationId: 1 }))).toBe(true)
  })

  it("recognizes a conflict wrapped by Effect.runPromise's FiberFailure", () => {
    expect(isGithubInstallationConflict({ cause: { _tag: "GithubIntegrationConflictError" } })).toBe(true)
  })

  it("does not misclassify other errors", () => {
    expect(isGithubInstallationConflict(new Error("boom"))).toBe(false)
    expect(isGithubInstallationConflict({ cause: { _tag: "RepositoryError" } })).toBe(false)
  })
})
