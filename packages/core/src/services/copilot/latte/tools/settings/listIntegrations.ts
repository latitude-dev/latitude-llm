import { Result } from '../../../../../lib/Result'
import { IntegrationsRepository } from '../../../../../repositories'
import { integrationPresenter } from '../presenters'
import { defineLatteTool } from '../types'

const listIntegrations = defineLatteTool(async (_, { workspace }) => {
  const integrationsScope = new IntegrationsRepository(workspace.id)
  const integrations = await integrationsScope.findAll().then((r) => r.unwrap())
  return Result.ok(integrations.map(integrationPresenter))
})

export default listIntegrations
