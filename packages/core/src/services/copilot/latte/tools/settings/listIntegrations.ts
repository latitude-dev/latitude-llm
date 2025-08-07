import { Result } from '../../../../../lib/Result'
import { integrationPresenter } from '../presenters'
import { defineLatteTool } from '../types'
import { listIntegrations as listIntegrationsLatte } from '../../../../integrations/list'

const listIntegrations = defineLatteTool(async (_, { workspace }) => {
  const integrations = await listIntegrationsLatte(workspace).then((r) => r.unwrap())
  return Result.ok(integrations.map(integrationPresenter))
})

export default listIntegrations
