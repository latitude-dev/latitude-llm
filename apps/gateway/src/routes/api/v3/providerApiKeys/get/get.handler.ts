import { findProviderApiKeyById } from '@latitude-data/core/queries/providerApiKeys/findById'
import { AppRouteHandler } from '$/openApi/types'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { getProviderApiKeyRouteConfig } from './get.route'

export const getProviderApiKeyHandler: AppRouteHandler<
  typeof getProviderApiKeyRouteConfig
> = async (c) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.valid('param')

  const providerApiKey = await findProviderApiKeyById({
    workspaceId: workspace.id,
    id: Number(providerApiKeyId),
  })

  return c.json(providerApiKeyPresenter(providerApiKey), 200)
}
