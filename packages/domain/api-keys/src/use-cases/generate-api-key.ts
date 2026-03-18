import { type ApiKeyId, defineErrorDynamic, type RepositoryError, SqlClient, type ValidationError } from "@domain/shared"
import { type CryptoError, hashToken } from "@repo/utils"
import { Effect } from "effect"
import { createApiKey, generateApiKeyToken } from "../entities/api-key.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"

export interface GenerateApiKeyInput {
  readonly id?: ApiKeyId
  readonly name: string
}

export class InvalidApiKeyNameError extends defineErrorDynamic(
  "InvalidApiKeyNameError",
  400,
  (f: { reason: string }) => f.reason,
)<{
  readonly name: string
  readonly reason: string
}> {}

export type GenerateApiKeyError = RepositoryError | ValidationError | InvalidApiKeyNameError | CryptoError

export const generateApiKeyUseCase = (input: GenerateApiKeyInput) =>
  Effect.gen(function* () {
    const { organizationId } = yield* SqlClient

    if (!input.name || input.name.trim().length === 0) {
      return yield* new InvalidApiKeyNameError({ name: input.name, reason: "Name cannot be empty" })
    }

    if (input.name.length > 256) {
      return yield* new InvalidApiKeyNameError({ name: input.name, reason: "Name exceeds 256 characters" })
    }

    const token = generateApiKeyToken()
    const tokenHash = yield* hashToken(token)
    const apiKey = createApiKey({
      id: input.id,
      organizationId,
      token,
      tokenHash,
      name: input.name.trim(),
    })

    const repo = yield* ApiKeyRepository
    yield* repo.save(apiKey)

    return apiKey
  })
