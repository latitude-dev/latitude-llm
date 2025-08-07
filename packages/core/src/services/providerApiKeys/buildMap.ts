import type { ProviderApiKey } from '../../browser'
import { database } from '../../client'
import { ProviderApiKeysRepository } from '../../repositories'

export async function buildProvidersMap(
  {
    workspaceId,
  }: {
    workspaceId: number
  },
  db = database,
) {
  const scope = new ProviderApiKeysRepository(workspaceId, db)
  const result = await scope.findAll().then((r) => r.unwrap())

  return result.reduce((acc, apiKey) => {
    acc.set(apiKey.name, apiKey)
    return acc
  }, new Map<string, ProviderApiKey>())
}
