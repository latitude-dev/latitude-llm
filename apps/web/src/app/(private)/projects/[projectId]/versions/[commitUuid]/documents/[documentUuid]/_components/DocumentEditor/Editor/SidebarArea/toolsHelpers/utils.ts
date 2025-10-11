import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { IntegrationDto } from '@latitude-data/core/schema/types'

export function isValidIntegration(
  name: string,
  integrations: IntegrationDto[],
) {
  return (
    name === 'latitude' ||
    integrations.some((integration) => integration.name === name)
  )
}

export function normalizeIntegrations(
  tools: LatitudePromptConfig['tools'],
): (string | Record<string, unknown>)[] {
  if (!tools) return []
  if (Array.isArray(tools)) return tools
  return Object.entries(tools).map(([toolName, toolDefinition]) => ({
    [toolName]: toolDefinition,
  }))
}
