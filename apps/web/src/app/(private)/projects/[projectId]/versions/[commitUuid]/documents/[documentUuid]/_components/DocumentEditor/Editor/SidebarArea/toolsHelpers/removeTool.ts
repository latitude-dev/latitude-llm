import { ActiveIntegration } from './types'

export function removeTool({
  currentActiveTools,
  toolName,
  allToolNames = [],
}: {
  currentActiveTools: ActiveIntegration['tools']
  toolName: string
  allToolNames: string[]
}): ActiveIntegration['tools'] {
  // Removing all tools (wildcard)
  if (toolName === '*') return []

  // If all tools are active (true), we need to create an array with all tools except the one being removed
  if (typeof currentActiveTools === 'boolean') {
    if (currentActiveTools) {
      return allToolNames.filter((tn) => tn !== toolName)
    }
    return []
  }

  // If currentActiveTools is an array, filter out the tool
  const toolsList = currentActiveTools ?? []
  return toolsList.filter((tn) => tn !== toolName)
}
