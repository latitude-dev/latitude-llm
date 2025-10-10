import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { ActiveIntegrations } from './types'
import { getIntegrationData } from './utils'

/**
 * Collects tools from a prompt configuration and integrates them with existing active integrations.
 *
 * @param integrations - Available workspace integrations
 * @param tools - Tools from the prompt configuration
 * @param existingMap - Existing active integrations map to preserve state
 * @returns Updated active integrations map
 */
export function collectTools({
  integrations,
  tools,
  existingMap,
}: {
  integrations: IntegrationDto[]
  tools?: LatitudePromptConfig['tools']
  existingMap: ActiveIntegrations
}) {
  const newIntegrationsMap = collectToolsFromConfig({ integrations, tools })

  // Preserve integrations from existing map
  const preservedMap = { ...existingMap }

  // Update existing integrations or add new ones from the config
  Object.entries(newIntegrationsMap).forEach(([name, integration]) => {
    preservedMap[name] = {
      ...integration,
      // Preserve allToolNames and isOpen state from existing map if it exists
      allToolNames: preservedMap[name]?.allToolNames ?? [],
      isOpen: preservedMap[name]?.isOpen ?? false,
    }
  })

  // For integrations in old map but not in new config, set tools to empty array
  Object.keys(preservedMap).forEach((integrationName) => {
    if (!newIntegrationsMap[integrationName]) {
      // Only keep if this integration still exists in workspace
      const stillExists = integrations.some((i) => i.name === integrationName)
      if (stillExists) {
        preservedMap[integrationName] = {
          ...preservedMap[integrationName],
          tools: [],
          // Keep allToolNames and isOpen from existing map
        }
      } else {
        // Integration was removed from workspace, delete it
        delete preservedMap[integrationName]
      }
    }
  })

  return preservedMap
}

/**
 * Internal helper to collect tools from a prompt configuration.
 */
function collectToolsFromConfig({
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

    const integration = getIntegrationData({
      integrations,
      name: integrationName,
    })

    if (!integration) return acc

    const activeIntegration = acc[integrationName]

    // First time seen
    if (!activeIntegration) {
      acc[integrationName] = {
        ...integration,
        tools: toolName === '*' ? true : toolName ? [toolName] : [],
        allToolNames: [],
        isOpen: false, // Closed by default when loaded from config
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

    // Add tool if not duplicate (and if toolName exists)
    if (toolName) {
      const toolsList = activeIntegration.tools ?? []
      if (!toolsList.includes(toolName)) {
        acc[integrationName].tools = [...toolsList, toolName]
      }
    }

    return acc
  }, {} as ActiveIntegrations)
}
