import { z } from 'zod'
import { IntegrationsRepository } from '../../../../../repositories'
import { listTools } from '../../../../integrations'
import { defineLatteTool } from '../types'

const listIntegrationTools = defineLatteTool(
  async ({ name }, { workspace }) => {
    const integrationsScope = new IntegrationsRepository(workspace.id)
    const integrationResult = await integrationsScope.findByName(name)
    if (!integrationResult.ok) return integrationResult
    const integration = integrationResult.unwrap()

    return listTools(integration)
  },
  z.object({
    name: z.string(),
  }),
)

export default listIntegrationTools
