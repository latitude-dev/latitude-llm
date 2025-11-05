import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

export function getIntegrationToolsFromConfig(
  config: Pick<LatitudePromptConfig, 'tools'>,
): string[] {
  const { tools } = config
  if (!tools) return []

  if (typeof tools === 'string') {
    return [tools]
  }

  if (Array.isArray(tools)) {
    return tools.filter((tool) => typeof tool === 'string')
  }

  return []
}

export function getIntegrationNamesFromTools(toolsIds: string[]): string[] {
  return toolsIds
    .map((toolId) => {
      const [integrationName, toolName] = toolId.split('/')
      if (!integrationName?.length) return undefined // Return undefined if name is empty
      if (!toolName?.length) return undefined // Return undefined if there is no '/' (not an integration tool)
      return integrationName
    })
    .filter((name): name is string => name !== undefined) // Remove instances where there is no '/'
    .filter((name, index, array) => array.indexOf(name) === index) // Remove duplicates
}

export function getCustomToolsFromConfig(
  config: Pick<LatitudePromptConfig, 'tools'>,
): {
  [name: string]: object
} {
  const { tools } = config
  if (!tools) return {}

  if (typeof tools === 'string') return {}

  if (Array.isArray(tools)) {
    return Object.fromEntries(
      tools
        .filter((tool) => typeof tool !== 'string')
        .map((toolMap) => Object.entries(toolMap))
        .flat(),
    )
  }

  return tools
}
