import { Context } from 'hono'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { serializeProviderApiKey } from '@latitude-data/core/services/providerApiKeys/helpers/serializeProviderApiKey'

export const getProviderApiKeyHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.param()

  const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  const providerApiKeyResult = await providerApiKeysRepository.find(
    Number(providerApiKeyId),
  )
  const providerApiKey = serializeProviderApiKey(providerApiKeyResult.unwrap())

  return c.json(providerApiKey, 200)
}
