import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { isActive, revoke } from "../entities/api-key.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"
import { ApiKeyCacheInvalidator } from "./revoke-api-key.ts"

/** Revokes every active API key of the organization bound on the `SqlClient`, busting each cached validation. */
export const revokeAllApiKeysUseCase = Effect.fn("apiKeys.revokeAllApiKeys")(function* () {
  const sqlClient = yield* SqlClient
  const cacheInvalidator = yield* ApiKeyCacheInvalidator

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* ApiKeyRepository
      const activeApiKeys = (yield* repo.list()).filter(isActive)

      const revokedApiKeys = activeApiKeys.map(revoke)
      for (const revokedApiKey of revokedApiKeys) {
        yield* repo.save(revokedApiKey)
        yield* cacheInvalidator.delete(revokedApiKey.tokenHash)
      }

      return revokedApiKeys
    }),
  )
})
