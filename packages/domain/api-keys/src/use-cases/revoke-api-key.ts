import type { ApiKeyId, NotFoundError, RepositoryError } from "@domain/shared"
import { Data, Effect, ServiceMap } from "effect"
import { revoke } from "../entities/api-key.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"

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

export const revokeApiKeyUseCase = (input: RevokeApiKeyInput) =>
  Effect.gen(function* () {
    const cacheInvalidator = yield* ApiKeyCacheInvalidator
    const repo = yield* ApiKeyRepository

    const apiKey = yield* repo.findById(input.id)
    if (apiKey.deletedAt !== null) return yield* new ApiKeyAlreadyRevokedError({ id: input.id })

    const revokedApiKey = revoke(apiKey)
    yield* repo.save(revokedApiKey)

    yield* cacheInvalidator.delete(revokedApiKey.tokenHash)

    return revokedApiKey
  })
