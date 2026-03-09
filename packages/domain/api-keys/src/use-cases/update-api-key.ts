import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { ApiKey } from "../entities/api-key.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"
import { ApiKeyNotFoundError } from "./revoke-api-key.ts"

export interface UpdateApiKeyInput {
  readonly id: ApiKey["id"]
  readonly name: string
}

export type UpdateApiKeyError = RepositoryError | ApiKeyNotFoundError

export const updateApiKeyUseCase = (
  input: UpdateApiKeyInput,
): Effect.Effect<ApiKey, UpdateApiKeyError, ApiKeyRepository> =>
  Effect.gen(function* () {
    const repository = yield* ApiKeyRepository
    const apiKey = yield* repository
      .findById(input.id)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.fail(new ApiKeyNotFoundError({ id: input.id }))))

    const updated: ApiKey = {
      ...apiKey,
      name: input.name,
      updatedAt: new Date(),
    }

    yield* repository.save(updated)

    return updated
  })
