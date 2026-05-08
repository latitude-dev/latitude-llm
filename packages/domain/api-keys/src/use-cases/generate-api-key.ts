import { OutboxEventWriter } from "@domain/events"
import { type ApiKeyId, type RepositoryError, SqlClient, type ValidationError } from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import { applyApiKeyTokenPrefix, createApiKey, generateApiKeyToken } from "../entities/api-key.ts"
import { InvalidApiKeyNameError } from "../errors.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"

export interface GenerateApiKeyInput {
  readonly id?: ApiKeyId
  readonly name: string
  readonly actorUserId?: string
}

export type GenerateApiKeyError = RepositoryError | ValidationError | InvalidApiKeyNameError | CryptoError

export const generateApiKeyUseCase = Effect.fn("apiKeys.generateApiKey")(function* (input: GenerateApiKeyInput) {
  const { organizationId } = yield* SqlClient
  if (input.id) {
    yield* Effect.annotateCurrentSpan("apiKey.id", input.id)
  }

  if (!input.name || input.name.trim().length === 0) {
    return yield* new InvalidApiKeyNameError({ name: input.name, reason: "Name cannot be empty" })
  }

  if (input.name.length > 256) {
    return yield* new InvalidApiKeyNameError({ name: input.name, reason: "Name exceeds 256 characters" })
  }

  // Hash the raw token (un-prefixed), so the stored hash matches what the
  // validator computes after stripping `lak_` from the incoming bearer. The
  // entity carries the prefixed token for the one-time creation response.
  const rawToken = generateApiKeyToken()
  const tokenHash = yield* hash(rawToken)
  const apiKey = createApiKey({
    id: input.id,
    organizationId,
    token: applyApiKeyTokenPrefix(rawToken),
    tokenHash,
    name: input.name.trim(),
  })

  const repo = yield* ApiKeyRepository
  yield* repo.save(apiKey)

  const outboxEventWriter = yield* OutboxEventWriter
  yield* outboxEventWriter.write({
    eventName: "ApiKeyCreated",
    aggregateType: "api_key",
    aggregateId: apiKey.id,
    organizationId,
    payload: {
      organizationId,
      actorUserId: input.actorUserId ?? "",
      apiKeyId: apiKey.id,
      name: apiKey.name,
    },
  })

  return apiKey
})
