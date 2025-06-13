import { Result } from '../../../../../lib/Result'
import { ProviderApiKeysRepository } from '../../../../../repositories'
import { providerPresenter } from '../presenters'
import { defineLatteTool } from '../types'

const listProviders = defineLatteTool(async (_, { workspace }) => {
  const providersScope = new ProviderApiKeysRepository(workspace.id)
  const providers = await providersScope.findAll().then((r) => r.unwrap())
  return Result.ok(providers.map(providerPresenter))
})

export default listProviders
