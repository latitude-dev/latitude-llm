import { SlackTokenRefreshError, SlackTokenRefresher } from "@domain/integrations"
import { Effect, Layer } from "effect"
import { SlackAuthError } from "./errors.ts"
import { refreshBotToken } from "./oauth.ts"

/**
 * Live adapter for the domain `SlackTokenRefresher` port. Closes over
 * the app's Slack credentials and bridges {@link refreshBotToken}'s
 * platform errors onto the domain `SlackTokenRefreshError`:
 *  - `SlackAuthError` (token_revoked) → `invalid_refresh_token` (terminal)
 *  - `incomplete_refresh_response` → `incomplete_response`
 *  - everything else → `transport` (retryable)
 *
 * Mirrors how `@platform/cache-redis` supplies lock-port adapters: the
 * Slack wire protocol stays here; the domain only sees the port.
 */
export const SlackTokenRefresherLive = (config: { readonly clientId: string; readonly clientSecret: string }) =>
  Layer.succeed(SlackTokenRefresher, {
    refresh: (refreshToken) =>
      refreshBotToken({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken,
      }).pipe(
        Effect.mapError((cause) => {
          if (cause instanceof SlackAuthError) {
            return new SlackTokenRefreshError({ reason: "invalid_refresh_token", cause })
          }
          if (cause.slackError === "incomplete_refresh_response") {
            return new SlackTokenRefreshError({ reason: "incomplete_response", cause })
          }
          return new SlackTokenRefreshError({ reason: "transport", cause })
        }),
      ),
  })
