import { Effect } from "effect"
import type { OAuthKey } from "../entities/oauth-key.ts"
import { OAuthKeyRepository } from "../ports/oauth-key-repository.ts"

/**
 * Returns the caller-organization's connected OAuth keys, newest first.
 * A thin wrapper today, but keeps the read path symmetric with revoke so
 * the route layer always goes through a use-case and the repository's
 * surface stays test-able in isolation.
 */
export const listOAuthKeysUseCase = Effect.fn("oauthKeys.listOAuthKeys")(function* () {
  const repository = yield* OAuthKeyRepository
  return (yield* repository.listForOrganization()) satisfies readonly OAuthKey[]
})
