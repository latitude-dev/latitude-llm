import { Context } from 'hono'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { updateProviderApiKeyName } from '@latitude-data/core/services/providerApiKeys/updateName'

export const updateProviderApiKeyHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.param()
  const body = await c.req.json()

  const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  const providerApiKeyResult = await providerApiKeysRepository.find(
    Number(providerApiKeyId),
  )
  const providerApiKey = providerApiKeyResult.unwrap()

  const result = await updateProviderApiKeyName({
    providerApiKey,
    workspaceId: workspace.id,
    name: body.name,
  })

  const updatedProviderApiKey = result.unwrap()
  return c.json(updatedProviderApiKey, 200)
}
