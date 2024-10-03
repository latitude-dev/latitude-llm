import { ProviderApiKey } from '../../browser'
import { ProviderApiKeysRepository } from '../../repositories'

export async function buildProvidersMap({
  workspaceId,
}: {
  workspaceId: number
}) {
  const scope = new ProviderApiKeysRepository(workspaceId)
  const result = await scope.findAll().then((r) => r.unwrap())

  return result.reduce((acc, apiKey) => {
    acc.set(apiKey.name, apiKey)
    return acc
  }, new Map<string, ProviderApiKey>())
}
