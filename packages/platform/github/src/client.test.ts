import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { listInstallationRepositories } from "./client.ts"
import type { GithubConfig } from "./config.ts"
import { GithubApiError } from "./errors.ts"

const config: GithubConfig = {
  appId: "1",
  appSlug: "latitude",
  privateKeyPem: "unused-here",
  webhookSecret: "unused",
  clientId: "unused",
  clientSecret: "unused",
  baseUrl: "https://github.com",
  apiBaseUrl: "https://api.github.com",
}

const response = (body: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  headers: new Headers(),
  json: async () => body,
  text: async () => JSON.stringify(body),
})

afterEach(() => vi.restoreAllMocks())

describe("listInstallationRepositories (HTTP boundary)", () => {
  it("maps repositories and follows pagination", async () => {
    const page1 = {
      repositories: Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        full_name: `acme/repo${i + 1}`,
        default_branch: "main",
        private: true,
      })),
    }
    const page2 = { repositories: [{ id: 101, full_name: "acme/last", default_branch: "trunk", private: false }] }
    const fetchMock = vi.fn().mockResolvedValueOnce(response(page1)).mockResolvedValueOnce(response(page2))
    vi.stubGlobal("fetch", fetchMock)

    const repos = await Effect.runPromise(listInstallationRepositories({ config, installationToken: "tok" }))

    expect(repos).toHaveLength(101)
    expect(repos[100]).toEqual({ id: 101, fullName: "acme/last", defaultBranch: "trunk", private: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/installation/repositories?per_page=100&page=1")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok")
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("stops after a page shorter than the page size and defaults missing fields", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ repositories: [{ id: 1, full_name: "acme/only" }] }))
    vi.stubGlobal("fetch", fetchMock)

    const repos = await Effect.runPromise(listInstallationRepositories({ config, installationToken: "tok" }))

    expect(repos).toEqual([{ id: 1, fullName: "acme/only", defaultBranch: "main", private: true }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("categorizes a 403 as an auth error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ message: "forbidden" }, { ok: false, status: 403 }))
    vi.stubGlobal("fetch", fetchMock)

    const error = await Effect.runPromise(
      listInstallationRepositories({ config, installationToken: "tok" }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(GithubApiError)
    expect(error.category).toBe("auth")
  })

  it("maps a fetch rejection (e.g. a fired request timeout) to a transient error", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"))
    vi.stubGlobal("fetch", fetchMock)

    const error = await Effect.runPromise(
      listInstallationRepositories({ config, installationToken: "tok" }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(GithubApiError)
    expect(error.category).toBe("transient")
  })
})
