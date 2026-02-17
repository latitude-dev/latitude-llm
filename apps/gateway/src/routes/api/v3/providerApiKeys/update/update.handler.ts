import { findProviderApiKeyById } from '@latitude-data/core/queries/providerApiKeys/findById'
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

  const providerApiKey = await findProviderApiKeyById({
    workspaceId: workspace.id,
    id: Number(providerApiKeyId),
  })

  const updatedProviderApiKey = await updateProviderApiKeyName({
    providerApiKey,
    workspaceId: workspace.id,
    name,
  }).then((result) => result.unwrap())

  return c.json(providerApiKeyPresenter(updatedProviderApiKey), 200)
}
