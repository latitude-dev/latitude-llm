import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { ApiKey } from "../entities/api-key.ts"
import { isActive, touch as touchApiKey } from "../entities/api-key.ts"
import type { ApiKeyRepository } from "../ports/api-key-repository.ts"

type ApiKeyRepositoryShape = (typeof ApiKeyRepository)["Service"]

export const createFakeApiKeyRepository = (overrides?: Partial<ApiKeyRepositoryShape>) => {
  const apiKeys = new Map<string, ApiKey>()

  const repository: ApiKeyRepositoryShape = {
    findById: (id) => {
      const apiKey = apiKeys.get(id)
      if (!apiKey) return Effect.fail(new NotFoundError({ entity: "ApiKey", id }))
      return Effect.succeed(apiKey)
    },

    list: () => Effect.succeed([...apiKeys.values()]),

    save: (apiKey) =>
      Effect.sync(() => {
        apiKeys.set(apiKey.id, apiKey)
      }),

    delete: (id) =>
      Effect.sync(() => {
        apiKeys.delete(id)
      }),

    touch: (id) =>
      Effect.sync(() => {
        const apiKey = apiKeys.get(id)
        if (apiKey) apiKeys.set(id, touchApiKey(apiKey))
      }),

    findByTokenHash: (tokenHash) => {
      const apiKey = [...apiKeys.values()].find((k) => k.tokenHash === tokenHash && isActive(k))
      if (!apiKey) return Effect.fail(new NotFoundError({ entity: "ApiKey", id: tokenHash }))
      return Effect.succeed(apiKey)
    },

    touchBatch: (ids) =>
      Effect.sync(() => {
        for (const id of ids) {
          const apiKey = apiKeys.get(id)
          if (apiKey) apiKeys.set(id, touchApiKey(apiKey))
        }
      }),

    ...overrides,
  }

  return { repository, apiKeys }
}
