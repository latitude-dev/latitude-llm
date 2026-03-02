import type { ApiKeyId, OrganizationId, RepositoryError, ValidationError } from "@domain/shared-kernel"
import { Data, Effect } from "effect"
import { type ApiKey, createApiKey, generateApiKeyToken } from "../entities/api-key.ts"
import type { ApiKeyRepository } from "../ports/api-key-repository.ts"

/**
 * Generate a new API key for an organization.
 *
 * This use case:
 * 1. Validates the API key name
 * 2. Generates a unique token (UUID)
 * 3. Creates the API key entity
 * 4. Persists to the repository
 * 5. Returns the created API key
 */
export interface GenerateApiKeyInput {
  readonly id: ApiKeyId
  readonly organizationId: OrganizationId
  readonly name: string
}

export class InvalidApiKeyNameError extends Data.TaggedError("InvalidApiKeyNameError")<{
  readonly name: string
  readonly reason: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason
  }
}

export type GenerateApiKeyError = RepositoryError | ValidationError | InvalidApiKeyNameError

export const generateApiKeyUseCase =
  (repository: ApiKeyRepository) =>
  (input: GenerateApiKeyInput): Effect.Effect<ApiKey, GenerateApiKeyError> => {
    return Effect.gen(function* () {
      // Validate name
      if (!input.name || input.name.trim().length === 0) {
        return yield* new InvalidApiKeyNameError({
          name: input.name,
          reason: "Name cannot be empty",
        })
      }

      if (input.name.length > 256) {
        return yield* new InvalidApiKeyNameError({
          name: input.name,
          reason: "Name exceeds 256 characters",
        })
      }

      // Generate token
      const token = generateApiKeyToken()

      // Create API key entity
      const apiKey = createApiKey({
        id: input.id,
        organizationId: input.organizationId,
        token,
        name: input.name.trim(),
      })

      // Persist
      yield* repository.save(apiKey)

      return apiKey
    })
  }
