import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { defineLatteTool } from '../types'
import { listTriggers } from '../../../../integrations/McpClient/listTriggers'
import { IntegrationType } from '@latitude-data/constants'
import { buildLatitudeIntegration } from '../../../../integrations/buildLatitudeIntegration'

const listIntegrationTriggers = defineLatteTool(
  async ({ integrationAppName }, { workspace }) => {
    // For Latte, Latitude is an integration with its own triggers and tools for better overall understanding
    if (integrationAppName === IntegrationType.Latitude) {
      const latitudeIntegration = buildLatitudeIntegration(workspace)
      const triggersResult = await listTriggers({
        integrationType: latitudeIntegration.type,
        integrationAppName: latitudeIntegration.name,
      })
      if (!Result.isOk(triggersResult)) return triggersResult
      const triggers = triggersResult.value
      return Result.ok(triggers)
    }

    const triggersResult = await listTriggers({
      integrationType: IntegrationType.Pipedream,
      integrationAppName,
    })
    if (!Result.isOk(triggersResult)) return triggersResult
    const triggers = triggersResult.value

    return Result.ok(triggers)
  },
  z.object({
    integrationAppName: z.string(),
  }),
)

export default listIntegrationTriggers
