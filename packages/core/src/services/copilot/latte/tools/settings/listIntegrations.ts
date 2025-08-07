import { Result } from '../../../../../lib/Result'
import { listIntegrations as listIntegrationsLatte } from '../../../../integrations/list'
import { integrationPresenter } from '../presenters'
import { defineLatteTool } from '../types'

const listIntegrations = defineLatteTool(async (_, { workspace }) => {
  const integrations = await listIntegrationsLatte(workspace).then((r) =>
    r.unwrap(),
  )
  return Result.ok(integrations.map(integrationPresenter))
})

export default listIntegrations
