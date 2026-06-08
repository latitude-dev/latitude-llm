import { OutboxEventWriter } from "@domain/events"
import {
  type ApiKeyId,
  type OrganizationId,
  type RepositoryError,
  SqlClient,
  type ValidationError,
} from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import { SANDBOX_API_KEY_TOKEN_PREFIX } from "../constants.ts"
import { createApiKey, generateApiKeyToken } from "../entities/api-key.ts"
import { InvalidApiKeyNameError } from "../errors.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"

export interface GenerateApiKeyInput {
  readonly id?: ApiKeyId
  readonly name: string
  readonly isSandbox: boolean
  readonly actorUserId?: string
  /**
   * Target org for the key. Defaults to the current `SqlClient` scope. Pass it
   * to mint a key in a *different* org within the caller's transaction — e.g.
   * `createSandboxUseCase` runs in the parent scope but seeds the key into the
   * new sandbox org (admin client, so RLS doesn't block the cross-org insert).
   */
  readonly organizationId?: OrganizationId
}

export type GenerateApiKeyError = RepositoryError | ValidationError | InvalidApiKeyNameError | CryptoError

export const generateApiKeyUseCase = Effect.fn("apiKeys.generateApiKey")(function* (input: GenerateApiKeyInput) {
  const organizationId = input.organizationId ?? (yield* SqlClient).organizationId
  if (input.id) {
    yield* Effect.annotateCurrentSpan("apiKey.id", input.id)
  }

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

  const token = generateApiKeyToken(input.isSandbox ? SANDBOX_API_KEY_TOKEN_PREFIX : "")
  const tokenHash = yield* hash(token)
  const apiKey = createApiKey({
    id: input.id,
    organizationId,
    token,
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
