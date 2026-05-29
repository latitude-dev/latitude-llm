import { InstallProvider } from "@slack/oauth"
import { WebClient } from "@slack/web-api"
import { Effect } from "effect"
import { SlackAuthError, SlackOAuthError } from "./errors.ts"
import { SLACK_BOT_SCOPES } from "./scopes.ts"

/**
 * Successful response from `oauth.v2.access` projected onto only the
 * fields the install use case needs. `refreshToken` and `expiresIn` are
 * present when token rotation is enabled on the Slack app (the v1
 * setup); the schema's nullable columns accept both cases.
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
 * `@slack/oauth`'s `InstallProvider` requires `clientId` and
 * `clientSecret` at construction. We only use it for URL generation
 * here (Phase 2 will plug in the real `installationStore` and use
 * `authorize()`); `stateVerification: false` skips the SDK's own state
 * encoding so callers can pass an externally-managed state token (the
 * CLI uses a self-describing dev token; Phase 2 will use a Redis-backed
 * CSRF state). The provider is cheap to construct — no caching needed.
 */
const createInstaller = (clientId: string, clientSecret: string): InstallProvider =>
  new InstallProvider({
    clientId,
    clientSecret,
    stateSecret: "unused-when-stateVerification-is-false",
    stateVerification: false,
  })

/**
 * Builds the Slack authorize URL a user is redirected to at the start of
 * the OAuth flow. `state` must be CSRF-bound by the caller (CLI uses a
 * self-describing dev token; the Phase 2 web flow puts state in Redis
 * with TTL 10min, keyed on org + user).
 *
 * We pass `stateVerification = true` to `generateInstallUrl` so the SDK
 * appends our state to the URL, but provide the state value externally
 * — the SDK only consults its own `stateStore` when state is not
 * provided. Verification is the caller's responsibility (Redis lookup
 * in the callback).
 */
export const buildSlackAuthorizeUrl = (input: {
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  readonly state: string
}): Effect.Effect<string, SlackOAuthError> =>
  Effect.tryPromise({
    try: () => {
      const installer = createInstaller(input.clientId, input.clientSecret)
      return installer.generateInstallUrl(
        {
          scopes: [...SLACK_BOT_SCOPES],
          redirectUri: input.redirectUri,
        },
        true,
        input.state,
      )
    },
    catch: (cause) => new SlackOAuthError({ cause }),
  })

/**
 * Exchanges an OAuth authorization code for the workspace's bot token.
 * Uses `@slack/web-api`'s `WebClient.oauth.v2.access` so we get typed
 * responses and Slack's own retry / error semantics; the underlying
 * call is the same `POST oauth.v2.access` we would otherwise issue by
 * hand.
 */
export const exchangeOAuthCode = (input: {
  readonly code: string
  readonly redirectUri: string
  readonly clientId: string
  readonly clientSecret: string
}): Effect.Effect<SlackOAuthResult, SlackOAuthError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        new WebClient().oauth.v2.access({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          code: input.code,
          redirect_uri: input.redirectUri,
        }),
      catch: (cause) => {
        // WebClient throws SlackApiError when `ok: false`; the Slack
        // error string sits at `cause.data.error`. Transport-level
        // failures bubble up as plain Error subclasses with no `data`.
        if (cause instanceof Error && "data" in cause) {
          const data = (cause as { data?: { error?: string } }).data
          if (data?.error && typeof data.error === "string") {
            return new SlackOAuthError({ slackError: data.error, cause })
          }
        }
        return new SlackOAuthError({ cause })
      },
    })

    const team = response.team
    const authedUser = response.authed_user
    if (
      !team?.id ||
      !team.name ||
      !response.access_token ||
      !response.bot_user_id ||
      !response.app_id ||
      !response.scope ||
      !authedUser?.id
    ) {
      return yield* Effect.fail(new SlackOAuthError({ slackError: "incomplete_response" }))
    }

    return {
      teamId: team.id,
      teamName: team.name,
      appId: response.app_id,
      botUserId: response.bot_user_id,
      botAccessToken: response.access_token,
      botTokenScopes: response.scope,
      authedUserId: authedUser.id,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
    }
  })

/**
 * Result of refreshing a rotated bot token. When token rotation is
 * enabled, every refresh returns a brand-new access token AND a new
 * single-use refresh token (the one we sent is revoked after a short
 * grace period) — both must be persisted or the rotation chain breaks.
 */
export interface SlackRefreshResult {
  readonly botAccessToken: string
  readonly refreshToken: string
  readonly expiresIn: number
}

/**
 * Exchanges a stored refresh token for a fresh bot token via
 * `oauth.v2.access` with `grant_type=refresh_token` (the token-rotation
 * renewal call — distinct from the initial code exchange in
 * {@link exchangeOAuthCode}). `OAuthV2AccessArguments` already types
 * `grant_type` / `refresh_token`, so no cast is needed.
 *
 * `invalid_refresh_token` is mapped to {@link SlackAuthError} (reason
 * `token_revoked`) so callers can treat a broken rotation chain as
 * "needs re-auth, do not retry" — distinct from transient transport
 * failures, which surface as {@link SlackOAuthError}.
 */
export const refreshBotToken = (input: {
  readonly clientId: string
  readonly clientSecret: string
  readonly refreshToken: string
}): Effect.Effect<SlackRefreshResult, SlackOAuthError | SlackAuthError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        new WebClient().oauth.v2.access({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          grant_type: "refresh_token",
          refresh_token: input.refreshToken,
        }),
      catch: (cause) => {
        if (cause instanceof Error && "data" in cause) {
          const data = (cause as { data?: { error?: string } }).data
          if (data?.error === "invalid_refresh_token") {
            return new SlackAuthError({ reason: "token_revoked" })
          }
          if (data?.error && typeof data.error === "string") {
            return new SlackOAuthError({ slackError: data.error, cause })
          }
        }
        return new SlackOAuthError({ cause })
      },
    })

    if (!response.access_token || !response.refresh_token || response.expires_in == null) {
      return yield* Effect.fail(new SlackOAuthError({ slackError: "incomplete_refresh_response" }))
    }

    return {
      botAccessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
    }
  })
