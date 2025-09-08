import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import { defineLatteTool } from '../types'
import { listTriggers } from '../../../../integrations/McpClient/listTriggers'
import { IntegrationType } from '@latitude-data/constants'
import { buildLatitudeIntegration } from '../../../../integrations/buildLatitudeIntegration'

const listIntegrationTriggers = defineLatteTool(
  async ({ appName }, { workspace }) => {
    // For Latte, Latitude is an integration with its own triggers and tools for better overall understanding
    if (appName === IntegrationType.Latitude) {
      const latitudeIntegration = buildLatitudeIntegration(workspace)
      const triggersResult = await listTriggers({
        integrationType: latitudeIntegration.type,
        appName: latitudeIntegration.name,
      })
      if (!Result.isOk(triggersResult)) return triggersResult
      const triggers = triggersResult.value
      return Result.ok(triggers)
    }

    const triggersResult = await listTriggers({
      integrationType: IntegrationType.Pipedream,
      appName,
    })
    if (!Result.isOk(triggersResult)) return triggersResult
    const triggers = triggersResult.value

    return Result.ok(triggers)
  },
  z.object({
    appName: z.string(),
  }),
)

export default listIntegrationTriggers
