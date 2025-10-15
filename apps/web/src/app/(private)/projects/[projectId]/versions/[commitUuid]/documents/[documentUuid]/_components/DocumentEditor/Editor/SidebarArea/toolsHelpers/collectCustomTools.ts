import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ClientToolMetadata } from './types'

export type CollectedClientTools = {
  toolNames: string[]
  metadata: Record<string, ClientToolMetadata>
}

/**
 * Extracts custom tool names and metadata from the prompt configuration.
 * Custom tools are defined as objects (not strings) in the tools array.
 *
 * @param tools - Tools from the prompt configuration
 * @returns Object with tool names array and metadata map
 */
export function collectCustomTools(
  tools?: LatitudePromptConfig['tools'],
): CollectedClientTools {
  if (!tools) return { toolNames: [], metadata: {} }
  if (!Array.isArray(tools)) return { toolNames: [], metadata: {} }

  const toolNames: string[] = []
  const metadata: Record<string, ClientToolMetadata> = {}

  tools
    .filter((tool) => typeof tool === 'object' && tool !== null)
    .forEach((tool) => {
      if (typeof tool === 'object' && !Array.isArray(tool)) {
        // Get the first key from the object (the tool name)
        const keys = Object.keys(tool)
        const toolName = keys.length > 0 ? keys[0] : null

        if (toolName) {
          toolNames.push(toolName)

          // Extract metadata if it exists and has parameters
          const toolConfig = (tool as Record<string, any>)[toolName]
          if (
            toolConfig &&
            typeof toolConfig === 'object' &&
            'parameters' in toolConfig
          ) {
            metadata[toolName] = {
              description: toolConfig.description,
              parameters: toolConfig.parameters as Record<string, unknown>,
            }
          }
        }
      }
    })

  return { toolNames, metadata }
}
