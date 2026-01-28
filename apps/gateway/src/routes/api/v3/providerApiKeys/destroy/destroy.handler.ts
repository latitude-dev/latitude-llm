import { Context } from 'hono'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { destroyProviderApiKey } from '@latitude-data/core/services/providerApiKeys/destroy'

export const destroyProviderApiKeyHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.param()

  const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  const providerApiKeyResult = await providerApiKeysRepository.find(
    Number(providerApiKeyId),
  )
  const providerApiKey = providerApiKeyResult.unwrap()

  const result = await destroyProviderApiKey(providerApiKey)
  const deletedProviderApiKey = result.unwrap()

  return c.json(deletedProviderApiKey, 200)
}
