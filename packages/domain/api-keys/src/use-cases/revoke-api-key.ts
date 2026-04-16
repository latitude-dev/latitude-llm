import { type ApiKeyId, type NotFoundError, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect, ServiceMap } from "effect"
import { revoke } from "../entities/api-key.ts"
import type { ApiKeyNotFoundError } from "../errors.ts"
import { ApiKeyAlreadyRevokedError } from "../errors.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"

export interface RevokeApiKeyInput {
  readonly id: ApiKeyId
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
    yield* Effect.annotateCurrentSpan("apiKey.id", input.id)
    const sqlClient = yield* SqlClient
    const cacheInvalidator = yield* ApiKeyCacheInvalidator

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository

        const apiKey = yield* repo.findById(input.id)
        if (apiKey.deletedAt !== null) return yield* new ApiKeyAlreadyRevokedError({ id: input.id })

        const revokedApiKey = revoke(apiKey)
        yield* repo.save(revokedApiKey)

        yield* cacheInvalidator.delete(revokedApiKey.tokenHash)

        return revokedApiKey
      }),
    )
  }).pipe(Effect.withSpan("apiKeys.revokeApiKey"))
