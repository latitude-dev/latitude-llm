import { Context } from 'hono'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'

// @ts-expect-error: broken types
export const getAllProviderApiKeysHandler = async (c: Context) => {
  const workspace = c.get('workspace')

  try {
    const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
    const providerApiKeysResult = await providerApiKeysRepository.findAll()

    if (providerApiKeysResult.error) {
      return c.json({ error: providerApiKeysResult.error.message }, 400)
    }

    const providerApiKeys = providerApiKeysResult.value.map((key) => ({
      ...key,
      token: '***masked***',
    }))

    return c.json(providerApiKeys, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
