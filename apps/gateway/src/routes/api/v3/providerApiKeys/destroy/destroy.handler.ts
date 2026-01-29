import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { destroyProviderApiKey } from '@latitude-data/core/services/providerApiKeys/destroy'
import { AppRouteHandler } from '$/openApi/types'
import { destroyProviderApiKeyRoute } from './destroy.route'

export const destroyProviderApiKeyHandler: AppRouteHandler<
  typeof destroyProviderApiKeyRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.valid('param')

  const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  const providerApiKey = await providerApiKeysRepository
    .find(Number(providerApiKeyId))
    .then((r) => r.unwrap())

  const deletedKey = await destroyProviderApiKey(providerApiKey).then((r) =>
    r.unwrap(),
  )

  const maskedKey = {
    ...deletedKey,
    token: '***masked***',
  }

  return c.json(maskedKey, 200)
}
