import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { AppRouteHandler } from '$/openApi/types'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { getAllProviderApiKeysRoute } from './getAll.route'

export const getAllProviderApiKeysHandler: AppRouteHandler<
  typeof getAllProviderApiKeysRoute
> = async (c) => {
  const workspace = c.get('workspace')

  const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  const providerApiKeys = await providerApiKeysRepository
    .findAll()
    .then((r) => r.unwrap())

  return c.json(providerApiKeys.map(providerApiKeyPresenter), 200)
}
