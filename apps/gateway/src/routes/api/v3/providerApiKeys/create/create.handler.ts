import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import { findFirstUserInWorkspace } from '@latitude-data/core/queries/users/findFirstInWorkspace'
import { Providers } from '@latitude-data/constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { type ProviderConfiguration } from '@latitude-data/core/schema/models/providerApiKeys'
import { AppRouteHandler } from '$/openApi/types'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { createProviderApiKeyRoute } from './create.route'

export const createProviderApiKeyHandler: AppRouteHandler<
  typeof createProviderApiKeyRoute
> = async (c) => {
  const workspace = c.get('workspace')

  const { name, provider, token, url, defaultModel, configuration } =
    c.req.valid('json') as {
      name: string
      provider: Providers
      token: string
      url?: string
      defaultModel?: string
      configuration?: ProviderConfiguration<Providers>
    }

  const user = await findFirstUserInWorkspace({ workspaceId: workspace.id })
  if (!user) {
    throw new NotFoundError('User not found in workspace')
  }

  const providerApiKey = await createProviderApiKey({
    workspace,
    author: user,
    name,
    provider,
    token,
    url,
    defaultModel,
    configuration,
  }).then((result) => result.unwrap())

  return c.json(providerApiKeyPresenter(providerApiKey), 201)
}
