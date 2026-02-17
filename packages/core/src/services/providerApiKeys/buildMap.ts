import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { database } from '../../client'
import { getOrSet } from '../../cache'
import { findAllProviderApiKeys } from '../../queries/providerApiKeys/findAll'

const PROVIDER_API_KEYS_MAP_CACHE_TTL = 3600 // 1 hour

export async function buildProvidersMap(
  {
    workspaceId,
  }: {
    workspaceId: number
  },
  db = database,
) {
  const cacheKey = `workspace:${workspaceId}:provider-api-keys-map`
  const result = await getOrSet(
    cacheKey,
    async () => {
      const result = await findAllProviderApiKeys({ workspaceId }, db)

      return result.reduce(
        (acc, apiKey) => {
          acc[apiKey.name] = apiKey

          return acc
        },
        {} as Record<string, ProviderApiKey>,
      )
    },
    PROVIDER_API_KEYS_MAP_CACHE_TTL,
  )

  return new Map(Object.entries(result))
}
