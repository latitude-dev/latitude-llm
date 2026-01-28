import { Context } from 'hono'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'

export const getAllProviderApiKeysHandler = async (c: Context) => {
  const workspace = c.get('workspace')

  try {
    const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
    const providerApiKeysResult = await providerApiKeysRepository.findAll()
    const providerApiKeys = providerApiKeysResult.unwrap()

    const maskedKeys = providerApiKeys.map((key) => ({
      ...key,
      token: '***masked***',
    }))

    return c.json(maskedKeys, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
