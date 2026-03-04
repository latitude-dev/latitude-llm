import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useMemo } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { createApiKey, deleteApiKey, listApiKeys, updateApiKey } from "./api-keys.functions.ts"
import type { ApiKeyRecord } from "./api-keys.functions.ts"

const queryClient = getQueryClient()

const createApiKeysCollection = (organizationId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["apiKeys", organizationId],
      queryFn: () => listApiKeys({ data: {} }),
      getKey: (item: ApiKeyRecord) => item.id,
      onInsert: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((mutation) =>
            createApiKey({
              data: {
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

export const useApiKeysCollection = (organizationId: string) => {
  const collection = useMemo(() => createApiKeysCollection(organizationId), [organizationId])
  return useLiveQuery((query) => query.from({ apiKey: collection }))
}
