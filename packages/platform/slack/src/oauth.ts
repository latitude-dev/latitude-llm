import { Effect } from "effect"
import { SlackOAuthError } from "./errors.ts"
import { SLACK_BOT_SCOPES } from "./scopes.ts"

const OAUTH_ACCESS_URL = "https://slack.com/api/oauth.v2.access"
const OAUTH_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"

/**
 * Successful response from `oauth.v2.access` projected onto only the
 * fields the install use case needs. `refreshToken` and `expiresIn` are
 * present only when token rotation is enabled on the Slack app (off in
 * v1; the schema reserves nullable columns for the future toggle).
 */
export interface SlackOAuthResult {
  readonly teamId: string
  readonly teamName: string
  readonly appId: string
  readonly botUserId: string
  readonly botAccessToken: string
  readonly botTokenScopes: string
  readonly authedUserId: string
  readonly refreshToken: string | undefined
  readonly expiresIn: number | undefined
}

/**
 * Builds the Slack authorize URL a user is redirected to at the start of
 * the OAuth flow. `state` must be CSRF-bound (in v1 we put it in Redis
 * with TTL 10min, keyed on the org and user id).
 */
export const buildSlackAuthorizeUrl = (input: {
  readonly clientId: string
  readonly redirectUri: string
  readonly state: string
}): string => {
  const params = new URLSearchParams({
    client_id: input.clientId,
    scope: SLACK_BOT_SCOPES.join(","),
    redirect_uri: input.redirectUri,
    state: input.state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Exchanges an OAuth authorization code for the workspace's bot token.
 * Uses raw `fetch` rather than the SDK to keep the call surface small
 * and the error path explicit — `oauth.v2.access` is unauthenticated, so
 * a token-less SDK client adds no value here.
 */
export const exchangeOAuthCode = (input: {
  readonly code: string
  readonly redirectUri: string
  readonly clientId: string
  readonly clientSecret: string
}): Effect.Effect<SlackOAuthResult, SlackOAuthError> =>
  Effect.gen(function* () {
    const body = new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
    })

    const json = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(OAUTH_ACCESS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        })
        return (await response.json()) as Record<string, unknown>
      },
      catch: (cause) => new SlackOAuthError({ cause }),
    })

    if (json.ok !== true) {
      const slackError = typeof json.error === "string" ? json.error : "unknown_error"
      return yield* Effect.fail(new SlackOAuthError({ slackError }))
    }

    const team = json.team as { id?: string; name?: string } | undefined
    const authedUser = json.authed_user as { id?: string } | undefined
    const accessToken = typeof json.access_token === "string" ? json.access_token : undefined
    const botUserId = typeof json.bot_user_id === "string" ? json.bot_user_id : undefined
    const appId = typeof json.app_id === "string" ? json.app_id : undefined
    const scope = typeof json.scope === "string" ? json.scope : undefined

    if (!team?.id || !team.name || !accessToken || !botUserId || !appId || !scope || !authedUser?.id) {
      return yield* Effect.fail(new SlackOAuthError({ slackError: "incomplete_response" }))
    }

    return {
      teamId: team.id,
      teamName: team.name,
      appId,
      botUserId,
      botAccessToken: accessToken,
      botTokenScopes: scope,
      authedUserId: authedUser.id,
      refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
      expiresIn: typeof json.expires_in === "number" ? json.expires_in : undefined,
    }
  })
