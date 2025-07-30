import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { IntegrationsRepository } from '../../../../../repositories'
import { defineLatteTool } from '../types'
import { listTriggers } from '../../../../integrations/McpClient/listTriggers'
import { buildLatitudeIntegration } from '../../../../integrations/list'

const listIntegrationTriggers = defineLatteTool(
  async ({ name }, { workspace }) => {
    // TODO - change when we merge Latitude integrations with its triggers
    if (name === 'latitude') {
      const latitudeIntegration = buildLatitudeIntegration(workspace)
      const triggersResult = await listTriggers(latitudeIntegration)
      if (!triggersResult.ok) return triggersResult
      const triggers = triggersResult.unwrap()
      return Result.ok(triggers)
    }

    const integrationsScope = new IntegrationsRepository(workspace.id)
    const integrationResult = await integrationsScope.findByName(name)
    if (!integrationResult.ok) return integrationResult
    const integration = integrationResult.unwrap()

    const triggersResult = await listTriggers(integration)
    if (!triggersResult.ok) return triggersResult
    const triggers = triggersResult.unwrap()

    return Result.ok(triggers)
  },
  z.object({
    name: z.string(),
  }),
)

export default listIntegrationTriggers
