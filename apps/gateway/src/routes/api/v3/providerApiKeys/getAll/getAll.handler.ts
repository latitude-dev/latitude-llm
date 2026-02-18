import { findAllProviderApiKeys } from '@latitude-data/core/queries/providerApiKeys/findAll'
import { AppRouteHandler } from '$/openApi/types'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { getAllProviderApiKeysRouteConfig } from './getAll.route'

export const getAllProviderApiKeysHandler: AppRouteHandler<
  typeof getAllProviderApiKeysRouteConfig
> = async (c) => {
  const workspace = c.get('workspace')

  const providerApiKeys = await findAllProviderApiKeys({
    workspaceId: workspace.id,
  })

  return c.json(providerApiKeys.map(providerApiKeyPresenter), 200)
}
