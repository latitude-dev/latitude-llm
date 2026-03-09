import type { ApiKeyId, OrganizationId, RepositoryError, ValidationError } from "@domain/shared"
import { type CryptoError, hashToken } from "@repo/utils"
import { Data, Effect } from "effect"
import { type ApiKey, createApiKey, generateApiKeyToken } from "../entities/api-key.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"

/**
 * Generate a new API key for an organization.
 *
 * This use case:
 * 1. Validates the API key name
 * 2. Generates a unique token (UUID)
 * 3. Hashes the token for indexed lookups
 * 4. Creates the API key entity
 * 5. Persists to the repository (token is encrypted at the adapter level)
 * 6. Returns the created API key (with plaintext token for the caller to show once)
 */
export interface GenerateApiKeyInput {
  readonly id?: ApiKeyId
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

export type GenerateApiKeyError = RepositoryError | ValidationError | InvalidApiKeyNameError | CryptoError

export const generateApiKeyUseCase = (
  input: GenerateApiKeyInput,
): Effect.Effect<ApiKey, GenerateApiKeyError, ApiKeyRepository> => {
  return Effect.gen(function* () {
    const repository = yield* ApiKeyRepository

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

    const token = generateApiKeyToken()
    const tokenHash = yield* hashToken(token)

    const apiKey = createApiKey({
      id: input.id,
      organizationId: input.organizationId,
      token,
      tokenHash,
      name: input.name.trim(),
    })

    yield* repository.save(apiKey)

    return apiKey
  })
}
