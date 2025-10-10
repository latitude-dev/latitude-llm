import { ActiveIntegration } from './types'

export function addTool({
  currentActiveTools,
  toolName,
}: {
  currentActiveTools: ActiveIntegration['tools']
  toolName: string
}): ActiveIntegration['tools'] {
  if (toolName === '*') return true
  if (!toolName) return currentActiveTools
  if (typeof currentActiveTools === 'boolean') return currentActiveTools

  // Handle undefined or empty array
  const toolsList = currentActiveTools ?? []
  if (toolsList.includes(toolName)) return toolsList

  return [...toolsList, toolName]
}
