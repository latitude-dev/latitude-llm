import { findProviderApiKeyById } from '@latitude-data/core/queries/providerApiKeys/findById'
import { destroyProviderApiKey } from '@latitude-data/core/services/providerApiKeys/destroy'
import { AppRouteHandler } from '$/openApi/types'
import { destroyProviderApiKeyRoute } from './destroy.route'

export const destroyProviderApiKeyHandler: AppRouteHandler<
  typeof destroyProviderApiKeyRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { providerApiKeyId } = c.req.valid('param')

  const providerApiKey = await findProviderApiKeyById({
    workspaceId: workspace.id,
    id: Number(providerApiKeyId),
  })

  const deletedKey = await destroyProviderApiKey(providerApiKey).then((r) =>
    r.unwrap(),
  )

  const maskedKey = {
    ...deletedKey,
    token: '***masked***',
  }

  return c.json(maskedKey, 200)
}
