import type { ApiKeyId, NotFoundError, RepositoryError } from "@domain/shared"
import { Data, Effect, ServiceMap } from "effect"
import { type ApiKey, revoke } from "../entities/api-key.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"

/**
 * Revoke (soft delete) an API key.
 *
 * This use case:
 * 1. Finds the API key by ID
 * 2. Checks if it exists and is not already revoked
 * 3. Marks it as revoked (sets deletedAt)
 * 4. Persists the changes
 * 5. Invalidates the cache entry (security-critical)
 */
export interface RevokeApiKeyInput {
  readonly id: ApiKeyId
}

export class ApiKeyNotFoundError extends Data.TaggedError("ApiKeyNotFoundError")<{
  readonly id: ApiKeyId
}> {
  readonly httpStatus = 404
  readonly httpMessage = "API key not found"
}

export class ApiKeyAlreadyRevokedError extends Data.TaggedError("ApiKeyAlreadyRevokedError")<{
  readonly id: ApiKeyId
}> {
  readonly httpStatus = 409
  readonly httpMessage = "API key already revoked"
}

export type RevokeApiKeyError = RepositoryError | NotFoundError | ApiKeyNotFoundError | ApiKeyAlreadyRevokedError

export class ApiKeyCacheInvalidator extends ServiceMap.Service<
  ApiKeyCacheInvalidator,
  {
    delete(tokenHash: string): Effect.Effect<void, never>
  }
>()("@domain/api-keys/ApiKeyCacheInvalidator") {}

export const revokeApiKeyUseCase = (
  input: RevokeApiKeyInput,
): Effect.Effect<ApiKey, RevokeApiKeyError, ApiKeyRepository | ApiKeyCacheInvalidator> => {
  return Effect.gen(function* () {
    const repository = yield* ApiKeyRepository
    const cacheInvalidator = yield* ApiKeyCacheInvalidator
    const apiKey = yield* repository
      .findById(input.id)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.fail(new ApiKeyNotFoundError({ id: input.id }))))

    if (apiKey.deletedAt !== null) {
      return yield* new ApiKeyAlreadyRevokedError({ id: input.id })
    }

    const revokedApiKey = revoke(apiKey)

    yield* repository.save(revokedApiKey)

    yield* cacheInvalidator.delete(apiKey.tokenHash)

    return revokedApiKey
  })
}
