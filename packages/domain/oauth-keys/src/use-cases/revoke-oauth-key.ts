import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { OAuthApplicationNotFoundError } from "../errors.ts"
import { OAuthKeyRepository, OAuthTokenCacheInvalidator } from "../ports/oauth-key-repository.ts"

export interface RevokeOAuthKeyInput {
  readonly clientId: string
  readonly userId: string
}

/**
 * Revokes one OAuth key — every access token for the `(client_id, user_id)`
 * pair — and disables the underlying application when that was the last
 * user holding tokens for it.
 *
 * Steps, in order, inside a single transaction:
 *
 * 1. RLS-scoped read on `oauth_applications` to confirm the client exists
 *    under the caller's organization. A cross-tenant client returns the
 *    same "not found" we'd surface for a typo, so there's no leak.
 * 2. Delete every access-token row for the pair, capturing the plaintext
 *    `access_token` values that were removed.
 * 3. Bust the Redis-cached positive validation for each removed token via
 *    `OAuthTokenCacheInvalidator`. Without this the API keeps serving
 *    cache hits for up to 5 minutes (the validator's TTL).
 * 4. Count remaining tokens for the same client across all users.
 * 5. If the count is zero, mark the application `disabled = true` so a
 *    later `redirect_uri` callback can't silently re-use a forgotten row.
 *
 * Wrapping in a transaction prevents partial state: a failure between
 * steps 2 and 5 would leave an undeletable / unreusable application that
 * looks revoked but isn't actually disabled.
 *
 * The cache invalidation runs inside the transaction too — its underlying
 * Redis op is best-effort (errors are absorbed by the invalidator), so a
 * Redis hiccup never rolls the DB writes back.
 */
export const revokeOAuthKeyUseCase = Effect.fn("oauthKeys.revokeOAuthKey")(function* (input: RevokeOAuthKeyInput) {
  yield* Effect.annotateCurrentSpan("oauthKey.clientId", input.clientId)
  yield* Effect.annotateCurrentSpan("oauthKey.userId", input.userId)

  const sqlClient = yield* SqlClient

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repository = yield* OAuthKeyRepository
      const cacheInvalidator = yield* OAuthTokenCacheInvalidator

      const exists = yield* repository.applicationBelongsToOrganization(input.clientId)
      if (!exists) {
        return yield* new OAuthApplicationNotFoundError({ clientId: input.clientId })
      }

      const deletedTokens = yield* repository.deleteTokensForPair({
        clientId: input.clientId,
        userId: input.userId,
      })

      for (const token of deletedTokens) {
        yield* cacheInvalidator.invalidate(token)
      }

      const hasRemaining = yield* repository.hasRemainingTokensForApplication(input.clientId)
      if (!hasRemaining) {
        yield* repository.markApplicationDisabled(input.clientId)
      }
    }),
  )
})
