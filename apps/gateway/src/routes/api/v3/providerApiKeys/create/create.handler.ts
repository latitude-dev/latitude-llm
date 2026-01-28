import { Context } from 'hono'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'

export const createProviderApiKeyHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const user = c.get('user')
  const body = await c.req.json()

  const result = await createProviderApiKey({
    workspace,
    author: user,
    name: body.name,
    provider: body.provider,
    token: body.token,
    url: body.url,
    defaultModel: body.defaultModel,
    configuration: body.configuration,
  })

  const providerApiKey = result.unwrap()
  return c.json(providerApiKey, 201)
}
