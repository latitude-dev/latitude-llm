import { type InvalidEnvValueError, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { GithubConfigError } from "./errors.ts"

export const DEFAULT_GITHUB_BASE_URL = "https://github.com"
const GITHUB_DOTCOM_API_BASE_URL = "https://api.github.com"

const stripTrailingSlash = (value: string): string => {
  let end = value.length
  while (end > 0 && value[end - 1] === "/") end--
  return value.slice(0, end)
}

/**
 * API base for a given web base. github.com uses the dedicated `api.github.com`
 * host; GitHub Enterprise Server exposes the REST API under `{host}/api/v3`.
 */
export const deriveGithubApiBaseUrl = (baseUrl: string): string => {
  const normalized = stripTrailingSlash(baseUrl)
  if (normalized === DEFAULT_GITHUB_BASE_URL) return GITHUB_DOTCOM_API_BASE_URL
  return `${normalized}/api/v3`
}

export const buildGithubInstallUrl = (input: {
  readonly baseUrl: string
  readonly appSlug: string
  readonly state: string
}): string =>
  `${stripTrailingSlash(input.baseUrl)}/apps/${input.appSlug}/installations/new?state=${encodeURIComponent(input.state)}`

export const buildGithubOAuthTokenUrl = (baseUrl: string): string =>
  `${stripTrailingSlash(baseUrl)}/login/oauth/access_token`

export interface GithubConfig {
  readonly appId: string
  readonly appSlug: string
  readonly privateKeyPem: string
  readonly webhookSecret: string
  readonly clientId: string
  readonly clientSecret: string
  readonly baseUrl: string
  readonly apiBaseUrl: string
}

const decodeBase64PrivateKey = (raw: string): Effect.Effect<string, GithubConfigError> =>
  Effect.try({
    try: () => {
      const pem = Buffer.from(raw, "base64").toString("utf8")
      if (!pem.includes("-----BEGIN")) {
        throw new Error("decoded value is not a PEM block")
      }
      return pem
    },
    catch: (cause) => new GithubConfigError({ reason: "LAT_GITHUB_APP_PRIVATE_KEY is not valid base64 PEM", cause }),
  })

/**
 * All-or-nothing loader: returns `undefined` when the GitHub App is not
 * configured for this environment (the integration is then hidden). `baseUrl`
 * is optional (defaults to github.com); every other credential is required.
 */
export const loadGithubConfig: Effect.Effect<GithubConfig | undefined, InvalidEnvValueError | GithubConfigError> =
  Effect.gen(function* () {
    const appId = yield* parseEnvOptional("LAT_GITHUB_APP_ID", "string")
    const appSlug = yield* parseEnvOptional("LAT_GITHUB_APP_SLUG", "string")
    const privateKeyRaw = yield* parseEnvOptional("LAT_GITHUB_APP_PRIVATE_KEY", "string")
    const webhookSecret = yield* parseEnvOptional("LAT_GITHUB_WEBHOOK_SECRET", "string")
    const clientId = yield* parseEnvOptional("LAT_GITHUB_APP_CLIENT_ID", "string")
    const clientSecret = yield* parseEnvOptional("LAT_GITHUB_APP_CLIENT_SECRET", "string")

    if (!appId || !appSlug || !privateKeyRaw || !webhookSecret || !clientId || !clientSecret) {
      return undefined
    }

    const baseUrl = stripTrailingSlash(
      (yield* parseEnvOptional("LAT_GITHUB_BASE_URL", "string")) ?? DEFAULT_GITHUB_BASE_URL,
    )
    const privateKeyPem = yield* decodeBase64PrivateKey(privateKeyRaw)

    return {
      appId,
      appSlug,
      privateKeyPem,
      webhookSecret,
      clientId,
      clientSecret,
      baseUrl,
      apiBaseUrl: deriveGithubApiBaseUrl(baseUrl),
    }
  })
