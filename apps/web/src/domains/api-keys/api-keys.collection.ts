import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { ApiKeyRecord } from "./api-keys.functions.ts"
import { createApiKey, deleteApiKey, listApiKeys, updateApiKey } from "./api-keys.functions.ts"

const queryClient = getQueryClient()

const apiKeysCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["apiKeys"],
    queryFn: () => listApiKeys(),
    getKey: (item: ApiKeyRecord) => item.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          createApiKey({
            data: {
              id: mutation.modified.id,
              name: mutation.modified.name ?? "API Key",
            },
          }),
        ),
      )
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          updateApiKey({
            data: {
              id: mutation.key,
              name: mutation.modified.name ?? "API Key",
            },
          }),
        ),
      )
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          deleteApiKey({
            data: {
              id: mutation.key,
            },
          }),
        ),
      )
    },
  }),
)

export function updateApiKeyMutation(id: string, name: string) {
  return apiKeysCollection.update(id, (draft) => {
    draft.name = name
  })
}

export function deleteApiKeyMutation(id: string) {
  return apiKeysCollection.delete(id)
}

export const useApiKeysCollection = () => {
  return useLiveQuery((query) => query.from({ apiKey: apiKeysCollection }))
}
