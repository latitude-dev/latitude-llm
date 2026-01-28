import { Context } from 'hono'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { serializeProviderApiKey } from '@latitude-data/core/services/providerApiKeys/helpers/serializeProviderApiKey'

export const getAllProviderApiKeysHandler = async (c: Context) => {
  const workspace = c.get('workspace')

  const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  const providerApiKeysResult = await providerApiKeysRepository.findAll()
  const providerApiKeys = providerApiKeysResult
    .unwrap()
    .map(serializeProviderApiKey)

  return c.json(providerApiKeys, 200)
}
