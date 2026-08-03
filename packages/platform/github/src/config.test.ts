import { describe, expect, it } from "vitest"
import { buildGithubInstallUrl, buildGithubOAuthTokenUrl, deriveGithubApiBaseUrl } from "./config.ts"

describe("deriveGithubApiBaseUrl", () => {
  it("maps github.com to api.github.com", () => {
    expect(deriveGithubApiBaseUrl("https://github.com")).toBe("https://api.github.com")
  })

  it("tolerates a trailing slash on github.com", () => {
    expect(deriveGithubApiBaseUrl("https://github.com/")).toBe("https://api.github.com")
  })

  it("derives {host}/api/v3 for a GitHub Enterprise Server host", () => {
    expect(deriveGithubApiBaseUrl("https://ghe.acme.com")).toBe("https://ghe.acme.com/api/v3")
  })
})

describe("url builders", () => {
  it("builds the install url with an encoded state", () => {
    expect(buildGithubInstallUrl({ baseUrl: "https://github.com", appSlug: "latitude", state: "a b/c" })).toBe(
      "https://github.com/apps/latitude/installations/new?state=a%20b%2Fc",
    )
  })

  it("builds the oauth token url", () => {
    expect(buildGithubOAuthTokenUrl("https://ghe.acme.com/")).toBe("https://ghe.acme.com/login/oauth/access_token")
  })
})
