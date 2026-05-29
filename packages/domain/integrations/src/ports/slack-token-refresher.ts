import { Context, type Effect } from "effect"
import type { SlackTokenRefreshError } from "../errors.ts"

/**
 * Result of a successful refresh: a brand-new bot access token, a new
 * single-use refresh token (the old one is revoked by Slack after a
 * short grace period), and the new token's lifetime in seconds.
 */
export interface SlackTokenRefreshResult {
  readonly botAccessToken: string
  readonly refreshToken: string
  readonly expiresIn: number
}

/**
 * Port for renewing a rotated Slack bot token. The live adapter
 * (`@platform/slack` `SlackTokenRefresherLive`) closes over the app's
 * `clientId` / `clientSecret` and calls `oauth.v2.access` with
 * `grant_type=refresh_token`; use-case tests pass a fake. Keeping the
 * credentials inside the adapter keeps env config out of the domain.
 */
export interface SlackTokenRefresherShape {
  refresh(refreshToken: string): Effect.Effect<SlackTokenRefreshResult, SlackTokenRefreshError>
}

export class SlackTokenRefresher extends Context.Service<SlackTokenRefresher, SlackTokenRefresherShape>()(
  "@domain/integrations/SlackTokenRefresher",
) {}
