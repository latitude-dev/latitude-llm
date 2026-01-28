import { Context } from 'hono'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'

export const getProviderApiKeyHandler = async (c: Context) => {
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

    const providerApiKey = {
      ...providerApiKeyResult.value,
      token: '***masked***',
    }

    return c.json(providerApiKey, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
