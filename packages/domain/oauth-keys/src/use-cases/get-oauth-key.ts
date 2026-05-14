import { Effect } from "effect"
import { OAuthKeyNotFoundError } from "../errors.ts"
import { OAuthKeyRepository } from "../ports/oauth-key-repository.ts"

export interface GetOAuthKeyInput {
  readonly clientId: string
  readonly userId: string
}

/**
 * Returns the OAuth key for a `(clientId, userId)` pair visible under the
 * caller's organization. Raises {@link OAuthKeyNotFoundError} (404) when
 * the row isn't here — same observable behaviour for non-existent pairs
 * and for cross-tenant pairs that the RLS read can't see, so existence
 * never leaks across orgs.
 */
export const getOAuthKeyUseCase = Effect.fn("oauthKeys.getOAuthKey")(function* (input: GetOAuthKeyInput) {
  yield* Effect.annotateCurrentSpan("oauthKey.clientId", input.clientId)
  yield* Effect.annotateCurrentSpan("oauthKey.userId", input.userId)

  const repository = yield* OAuthKeyRepository
  const row = yield* repository.findByPair(input)
  if (!row) {
    return yield* new OAuthKeyNotFoundError({ clientId: input.clientId, userId: input.userId })
  }
  return row
})
