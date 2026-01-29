import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { updateProviderApiKeyName } from '@latitude-data/core/services/providerApiKeys/updateName'
import { AppRouteHandler } from '$/openApi/types'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { updateProviderApiKeyRoute } from './update.route'

export const updateProviderApiKeyHandler: AppRouteHandler<
  typeof updateProviderApiKeyRoute
> = async (c) => {
  const workspace = c.get('workspace')

  const { providerApiKeyId } = c.req.valid('param')
  const { name } = c.req.valid('json')

  const providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  const providerApiKey = await providerApiKeysRepository
    .find(Number(providerApiKeyId))
    .then((result) => result.unwrap())

  const updatedProviderApiKey = await updateProviderApiKeyName({
    providerApiKey,
    workspaceId: workspace.id,
    name,
  }).then((result) => result.unwrap())

  return c.json(providerApiKeyPresenter(updatedProviderApiKey), 200)
}
