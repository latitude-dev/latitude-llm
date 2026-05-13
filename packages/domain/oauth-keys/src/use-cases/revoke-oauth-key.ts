import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { OAuthApplicationNotFoundError } from "../errors.ts"
import { OAuthKeyRepository } from "../ports/oauth-key-repository.ts"

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
 * 2. Delete every access-token row for the pair. The next API request the
 *    client makes with one of those tokens returns 401.
 * 3. Count remaining tokens for the same client across all users.
 * 4. If the count is zero, mark the application `disabled = true` so a
 *    later `redirect_uri` callback can't silently re-use a forgotten row.
 *
 * Wrapping in a transaction prevents partial state: a failure between
 * steps 2 and 4 would leave an undeletable / unreusable application that
 * looks revoked but isn't actually disabled. The transaction rolls all
 * three writes back together.
 */
export const revokeOAuthKeyUseCase = Effect.fn("oauthKeys.revokeOAuthKey")(function* (input: RevokeOAuthKeyInput) {
  yield* Effect.annotateCurrentSpan("oauthKey.clientId", input.clientId)
  yield* Effect.annotateCurrentSpan("oauthKey.userId", input.userId)

  const sqlClient = yield* SqlClient

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repository = yield* OAuthKeyRepository

      const exists = yield* repository.applicationBelongsToOrganization(input.clientId)
      if (!exists) {
        return yield* new OAuthApplicationNotFoundError({ clientId: input.clientId })
      }

      yield* repository.deleteTokensForPair({ clientId: input.clientId, userId: input.userId })

      const hasRemaining = yield* repository.hasRemainingTokensForApplication(input.clientId)
      if (!hasRemaining) {
        yield* repository.markApplicationDisabled(input.clientId)
      }
    }),
  )
})
