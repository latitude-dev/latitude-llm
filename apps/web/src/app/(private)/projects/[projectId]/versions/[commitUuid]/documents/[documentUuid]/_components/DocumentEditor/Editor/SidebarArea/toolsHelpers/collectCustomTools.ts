import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

/**
 * Extracts custom tool names from the prompt configuration.
 * Custom tools are defined as objects (not strings) in the tools array.
 *
 * @param tools - Tools from the prompt configuration
 * @returns Array of custom tool names
 */
export function collectCustomTools(
  tools?: LatitudePromptConfig['tools'],
): string[] {
  if (!tools) return []
  if (!Array.isArray(tools)) return []

  return tools
    .filter((tool) => typeof tool === 'object' && tool !== null)
    .map((tool) => {
      if (typeof tool === 'object' && !Array.isArray(tool)) {
        // Get the first key from the object (the tool name)
        const keys = Object.keys(tool)
        return keys.length > 0 ? keys[0] : null
      }
      return null
    })
    .filter((toolName): toolName is string => toolName !== null)
}
