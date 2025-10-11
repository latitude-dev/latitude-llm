import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { ActiveIntegrations } from './types'
import { isValidIntegration } from './utils'

/**
 * This function collect all active tools on a give prompt
 *
 * It returns active integrations with their tools
 * {
 *   google: ['search', 'calendar'],
 *   slack: true // all tools
 * }
 *
 * It also validate that the integration exist in the workspace
 */
export function collectTools({
  integrations,
  tools,
}: {
  integrations: IntegrationDto[]
  tools?: LatitudePromptConfig['tools']
}) {
  if (!tools) return {}
  if (!Array.isArray(tools)) return {}

  return tools.reduce((acc, tool) => {
    if (typeof tool !== 'string') return acc

    const [integrationName, toolName] = tool.split('/')

    if (!integrationName) return acc
    if (!isValidIntegration(integrationName, integrations)) return acc

    // Case: integration only (no tool specified)
    if (!toolName) {
      acc[integrationName] = { name: integrationName, tools: [] }
      return acc
    }

    const activeIntegration = acc[integrationName]

    // First time seen
    if (!activeIntegration) {
      acc[integrationName] = {
        name: integrationName,
        tools: toolName === '*' ? true : [toolName],
      }
      return acc
    }

    // Already wildcard? skip
    if (typeof activeIntegration.tools === 'boolean') return acc

    // New wildcard? override
    if (toolName === '*') {
      acc[integrationName].tools = true
      return acc
    }

    // Add tool if not duplicate
    const toolsList = activeIntegration.tools ?? []
    if (!toolsList.includes(toolName)) {
      acc[integrationName].tools = [...toolsList, toolName]
    }

    return acc
  }, {} as ActiveIntegrations)
}
