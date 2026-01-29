import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { AppRouteHandler } from '$/openApi/types'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { getProviderApiKeyRoute } from './get.route'

export const getProviderApiKeyHandler: AppRouteHandler<
  typeof getProviderApiKeyRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.valid('param')

  const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  const providerApiKey = await providerApiKeysRepository
    .find(Number(providerApiKeyId))
    .then((r) => r.unwrap())

  return c.json(providerApiKeyPresenter(providerApiKey), 200)
}
