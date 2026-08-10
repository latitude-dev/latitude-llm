import { Effect } from "effect"
import type { GithubConfig } from "./config.ts"
import { buildGithubOAuthTokenUrl } from "./config.ts"
import { GithubApiError, type GithubApiErrorCategory } from "./errors.ts"
import { signGithubAppJwt } from "./jwt.ts"

const API_VERSION = "2022-11-28"
const USER_AGENT = "latitude-github-app"

// Node's fetch has no default timeout; without a signal a stalled GitHub host
// would hang the calling worker/request thread (webhook, OAuth callback, token
// minting) indefinitely. The signal also bounds the response-body read.
const REQUEST_TIMEOUT_MS = 10_000

const categorizeStatus = (status: number): GithubApiErrorCategory => {
  if (status === 401 || status === 403) return "auth"
  if (status === 404) return "not_found"
  if (status === 429) return "rate_limited"
  if (status >= 500) return "transient"
  return "client"
}

const parseRetryAfter = (headers: Headers): number | undefined => {
  const raw = headers.get("retry-after")
  if (!raw) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) ? seconds : undefined
}

const baseHeaders = (): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": USER_AGENT,
})

const githubRequest = <T>(input: {
  readonly url: string
  readonly method: "GET" | "POST"
  readonly headers: Record<string, string>
  readonly body?: string
  readonly operation: string
}): Effect.Effect<T, GithubApiError> =>
  Effect.gen(function* () {
    const requestInit: RequestInit = {
      method: input.method,
      headers: input.headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(input.body === undefined ? {} : { body: input.body }),
    }
    const response = yield* Effect.tryPromise({
      try: () => fetch(input.url, requestInit),
      catch: (cause) => new GithubApiError({ operation: input.operation, category: "transient", cause }),
    })

    if (!response.ok) {
      const detail = yield* Effect.promise(() => response.text().catch(() => ""))
      const retryAfterSec = parseRetryAfter(response.headers)
      return yield* Effect.fail(
        new GithubApiError({
          operation: input.operation,
          category: categorizeStatus(response.status),
          status: response.status,
          ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
          cause: detail,
        }),
      )
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: (cause) => new GithubApiError({ operation: input.operation, category: "transient", cause }),
    })
  })

const appJwtHeaders = (config: GithubConfig): Effect.Effect<Record<string, string>, GithubApiError> =>
  signGithubAppJwt({ appId: config.appId, privateKeyPem: config.privateKeyPem }).pipe(
    Effect.map((jwt) => ({ ...baseHeaders(), Authorization: `Bearer ${jwt}` })),
    Effect.mapError((cause) => new GithubApiError({ operation: "signAppJwt", category: "auth", cause })),
  )

export interface GithubInstallationMetadata {
  readonly id: number
  readonly accountLogin: string
  readonly accountType: string
  readonly repositorySelection: string
  readonly suspendedAt: Date | null
}

export interface GithubInstallationRepository {
  readonly id: number
  readonly fullName: string
  readonly defaultBranch: string
  readonly private: boolean
}

/**
 * Exchanges an OAuth `code` for a short-lived user access token. Used once
 * during install to prove (via {@link listUserInstallations}) that the
 * installing user actually owns the installation GitHub redirected with — the
 * documented defense against spoofed `installation_id` setup redirects.
 */
export const exchangeOAuthCode = (input: {
  readonly config: GithubConfig
  readonly code: string
  readonly redirectUri: string
}): Effect.Effect<string, GithubApiError> =>
  githubRequest<{ access_token?: string; error?: string }>({
    url: buildGithubOAuthTokenUrl(input.config.baseUrl),
    method: "POST",
    headers: { ...baseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
    operation: "exchangeOAuthCode",
  }).pipe(
    Effect.flatMap((result) =>
      result.access_token
        ? Effect.succeed(result.access_token)
        : Effect.fail(new GithubApiError({ operation: "exchangeOAuthCode", category: "auth", cause: result.error })),
    ),
  )

/** Installation ids the given user token can see — the claim ownership check. */
export const listUserInstallations = (input: {
  readonly config: GithubConfig
  readonly userAccessToken: string
}): Effect.Effect<readonly number[], GithubApiError> =>
  githubRequest<{ installations?: { id: number }[] }>({
    url: `${input.config.apiBaseUrl}/user/installations?per_page=100`,
    method: "GET",
    headers: { ...baseHeaders(), Authorization: `Bearer ${input.userAccessToken}` },
    operation: "listUserInstallations",
  }).pipe(Effect.map((result) => (result.installations ?? []).map((installation) => installation.id)))

/** Installation metadata read with the App JWT (account, repo selection, suspension). */
export const getInstallation = (input: {
  readonly config: GithubConfig
  readonly installationId: number
}): Effect.Effect<GithubInstallationMetadata, GithubApiError> =>
  Effect.gen(function* () {
    const headers = yield* appJwtHeaders(input.config)
    const raw = yield* githubRequest<{
      id: number
      account?: { login?: string; type?: string } | null
      repository_selection?: string
      suspended_at?: string | null
    }>({
      url: `${input.config.apiBaseUrl}/app/installations/${input.installationId}`,
      method: "GET",
      headers,
      operation: "getInstallation",
    })
    return {
      id: raw.id,
      accountLogin: raw.account?.login ?? "",
      accountType: raw.account?.type ?? "Organization",
      repositorySelection: raw.repository_selection ?? "all",
      suspendedAt: raw.suspended_at ? new Date(raw.suspended_at) : null,
    }
  })

/** Mints a raw installation access token (60-minute lifetime). Uncached — callers should cache in Redis. */
export const mintInstallationToken = (input: {
  readonly config: GithubConfig
  readonly installationId: number
}): Effect.Effect<{ readonly token: string; readonly expiresAt: Date }, GithubApiError> =>
  Effect.gen(function* () {
    const headers = yield* appJwtHeaders(input.config)
    const raw = yield* githubRequest<{ token: string; expires_at: string }>({
      url: `${input.config.apiBaseUrl}/app/installations/${input.installationId}/access_tokens`,
      method: "POST",
      headers,
      operation: "mintInstallationToken",
    })
    return { token: raw.token, expiresAt: new Date(raw.expires_at) }
  })

/** Repositories visible to an installation, paginated. Used by the settings repo picker. */
export const listInstallationRepositories = (input: {
  readonly config: GithubConfig
  readonly installationToken: string
}): Effect.Effect<readonly GithubInstallationRepository[], GithubApiError> => {
  const fetchPage = (page: number) =>
    githubRequest<{
      repositories?: { id: number; full_name: string; default_branch?: string; private?: boolean }[]
    }>({
      url: `${input.config.apiBaseUrl}/installation/repositories?per_page=100&page=${page}`,
      method: "GET",
      headers: { ...baseHeaders(), Authorization: `Bearer ${input.installationToken}` },
      operation: "listInstallationRepositories",
    }).pipe(
      Effect.map((result) =>
        (result.repositories ?? []).map((repo) => ({
          id: repo.id,
          fullName: repo.full_name,
          defaultBranch: repo.default_branch ?? "main",
          private: repo.private ?? true,
        })),
      ),
    )

  return Effect.gen(function* () {
    const collected: GithubInstallationRepository[] = []
    let page = 1
    while (true) {
      const pageRepos = yield* fetchPage(page)
      collected.push(...pageRepos)
      if (pageRepos.length < 100) break
      page += 1
    }
    return collected
  })
}
