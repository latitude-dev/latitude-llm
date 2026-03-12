import type { ApiKeyId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { ApiKey } from "../entities/api-key.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"
import { ApiKeyNotFoundError } from "./revoke-api-key.ts"

export interface UpdateApiKeyInput {
  readonly id: ApiKeyId
  readonly name: string
}

export type UpdateApiKeyError = RepositoryError | ApiKeyNotFoundError

export const updateApiKeyUseCase = (input: UpdateApiKeyInput) =>
  Effect.gen(function* () {
    const repo = yield* ApiKeyRepository
    const apiKey = yield* repo
      .findById(input.id)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.fail(new ApiKeyNotFoundError({ id: input.id }))))

    const updated: ApiKey = { ...apiKey, name: input.name, updatedAt: new Date() }
    yield* repo.save(updated)

    return updated
  })
