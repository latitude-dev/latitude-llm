import type { ApiKeyId, NotFoundError, RepositoryError } from "@domain/shared-kernel"
import { Data, Effect } from "effect"
import { type ApiKey, revoke } from "../entities/api-key.ts"
import type { ApiKeyRepository } from "../ports/api-key-repository.ts"

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

/**
 * Port for cache invalidation operations.
 * Implemented by platform layer (e.g., Redis adapter).
 */
export interface CacheInvalidator {
  /**
   * Delete a cached API key entry.
   * @param token The API key token to invalidate
   */
  readonly delete: (token: string) => Effect.Effect<void, never>
}

export interface RevokeApiKeyDeps {
  readonly repository: ApiKeyRepository
  readonly cacheInvalidator: CacheInvalidator
}

export const revokeApiKeyUseCase =
  (deps: RevokeApiKeyDeps) =>
  (input: RevokeApiKeyInput): Effect.Effect<ApiKey, RevokeApiKeyError> => {
    return Effect.gen(function* () {
      // Find the API key
      const apiKey = yield* deps.repository.findById(input.id)

      if (!apiKey) {
        return yield* new ApiKeyNotFoundError({ id: input.id })
      }

      // Check if already revoked
      if (apiKey.deletedAt !== null) {
        return yield* new ApiKeyAlreadyRevokedError({ id: input.id })
      }

      // Revoke (soft delete)
      const revokedApiKey = revoke(apiKey)

      // Persist
      yield* deps.repository.save(revokedApiKey)

      // Invalidate cache entry (security-critical)
      // This ensures revoked keys are immediately rejected
      yield* deps.cacheInvalidator.delete(apiKey.token)

      return revokedApiKey
    })
  }
