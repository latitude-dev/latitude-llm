import { Context } from 'hono'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { destroyProviderApiKey } from '@latitude-data/core/services/providerApiKeys/destroy'

// @ts-expect-error: broken types
export const destroyProviderApiKeyHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.param()

  try {
    const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
    const providerApiKeyResult = await providerApiKeysRepository.find(
      Number(providerApiKeyId),
    )

    if (providerApiKeyResult.error) {
      return c.json({ error: 'Provider API key not found' }, 404)
    }

    const result = await destroyProviderApiKey(providerApiKeyResult.value)

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    const deletedProviderApiKey = {
      ...result.value,
      token: '***masked***',
    }

    return c.json(deletedProviderApiKey, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
