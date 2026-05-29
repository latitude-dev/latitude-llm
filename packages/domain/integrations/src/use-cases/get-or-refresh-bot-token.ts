import type { CacheError, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SLACK_REFRESH_LOCK_TTL_SECONDS, SLACK_TOKEN_REFRESH_SKEW_SECONDS } from "../constants.ts"
import type { SlackIntegration } from "../entities/slack-integration.ts"
import type { SlackRefreshLockUnavailableError, SlackTokenRefreshError } from "../errors.ts"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"
import { SlackRefreshLockRepository } from "../ports/slack-refresh-lock-repository.ts"
import { SlackTokenRefresher } from "../ports/slack-token-refresher.ts"

export interface GetOrRefreshBotTokenInput {
  readonly integration: SlackIntegration
  /**
   * Refresh when the token expires within this many seconds. Defaults to
   * the on-use skew ({@link SLACK_TOKEN_REFRESH_SKEW_SECONDS}, ~5 min) so
   * normal reads only refresh at the last moment. The scheduled sweep
   * passes the larger lookahead window so it proactively refreshes well
   * ahead of expiry.
   */
  readonly refreshIfExpiringWithinSeconds?: number
}

export type GetOrRefreshBotTokenError =
  | RepositoryError
  | SlackTokenRefreshError
  | SlackRefreshLockUnavailableError
  | CacheError

const isFresh = (tokenExpiresAt: Date, skewMs: number): boolean => tokenExpiresAt.getTime() - Date.now() > skewMs

/**
 * Returns a usable bot access token for the given integration,
 * transparently refreshing it first when token rotation is enabled and
 * the token is at/near expiry.
 *
 * `@platform/slack` knows *how* to refresh (the `oauth.v2.access`
 * call behind {@link SlackTokenRefresher}); this use-case owns *when* to
 * refresh and *that the rotated pair must be persisted*:
 *
 *  1. `tokenExpiresAt === null` (or no refresh token) → rotation is
 *     disabled; the token is long-lived, use it as-is.
 *  2. token still fresh (expires beyond the skew window) → use as-is,
 *     no lock taken (the common path).
 *  3. token at/near expiry → take the per-workspace single-flight lock,
 *     re-read the integration (another holder may have just rotated it),
 *     re-test freshness, and only then call Slack, persist the new
 *     triple via {@link SlackIntegrationRepository.updateTokens}, and
 *     return the new token.
 *
 * The lock + double-check guarantee at most one Slack refresh per
 * workspace across all concurrent triggers (on-use reads and the
 * scheduled sweep), so the single-use refresh token is never rotated
 * twice and clobbered.
 */
export const getOrRefreshBotTokenUseCase = (
  input: GetOrRefreshBotTokenInput,
): Effect.Effect<
  string,
  GetOrRefreshBotTokenError,
  SqlClient | SlackIntegrationRepository | SlackRefreshLockRepository | SlackTokenRefresher
> =>
  Effect.gen(function* () {
    const { integration } = input
    const skewMs = (input.refreshIfExpiringWithinSeconds ?? SLACK_TOKEN_REFRESH_SKEW_SECONDS) * 1000

    // Rotation disabled — token never expires.
    if (integration.tokenExpiresAt === null || integration.refreshToken === null) {
      return integration.botAccessToken
    }

    // Still comfortably valid — fast path, no lock.
    if (isFresh(integration.tokenExpiresAt, skewMs)) {
      return integration.botAccessToken
    }

    const lock = yield* SlackRefreshLockRepository
    return yield* lock.withRefreshLock(
      { organizationId: integration.organizationId, ttlSeconds: SLACK_REFRESH_LOCK_TTL_SECONDS },
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        // Re-read inside the lock: a concurrent holder may have rotated
        // the token (or the integration may have been revoked) while we
        // waited to acquire it.
        const current = yield* repo.findActiveByOrganizationId()
        if (!current || current.id !== integration.id) {
          // Revoked or replaced mid-flight — hand back the token we had;
          // the caller's Slack call will fail/skip on its own terms.
          return integration.botAccessToken
        }
        if (current.tokenExpiresAt === null || current.refreshToken === null) {
          return current.botAccessToken
        }
        if (isFresh(current.tokenExpiresAt, skewMs)) {
          // Another holder already refreshed — use the fresh token.
          return current.botAccessToken
        }

        const refresher = yield* SlackTokenRefresher
        const refreshed = yield* refresher.refresh(current.refreshToken)
        const tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000)
        // Persist before returning: losing the new single-use refresh
        // token would permanently break the rotation chain.
        yield* repo.updateTokens(current.id, {
          botAccessToken: refreshed.botAccessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpiresAt,
        })
        return refreshed.botAccessToken
      }),
    )
  })
