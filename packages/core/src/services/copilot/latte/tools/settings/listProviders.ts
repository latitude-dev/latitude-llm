import { Result } from '../../../../../lib/Result'
import { findAllProviderApiKeys } from '../../../../../queries/providerApiKeys/findAll'
import { providerPresenter } from '../presenters'
import { defineLatteTool } from '../types'

const listProviders = defineLatteTool(async (_, { workspace }) => {
  const providers = await findAllProviderApiKeys({ workspaceId: workspace.id })
  return Result.ok(providers.map(providerPresenter))
})

export default listProviders
