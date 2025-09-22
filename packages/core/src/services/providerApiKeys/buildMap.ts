import { ProviderApiKey } from '../../browser'
import { database } from '../../client'
import { getOrSet } from '../../cache'
import { ProviderApiKeysRepository } from '../../repositories'

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

  return await getOrSet(
    cacheKey,
    async () => {
      const scope = new ProviderApiKeysRepository(workspaceId, db)
      const result = await scope.findAll().then((r) => r.unwrap())

      return result.reduce((acc, apiKey) => {
        acc.set(apiKey.name, apiKey)
        return acc
      }, new Map<string, ProviderApiKey>())
    },
    PROVIDER_API_KEYS_MAP_CACHE_TTL,
  )
}
