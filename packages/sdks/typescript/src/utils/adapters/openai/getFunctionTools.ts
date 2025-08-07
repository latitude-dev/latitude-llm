import type { ProviderToolResponse } from '$sdk/utils/adapters/getProviderTools'

export function getOpenAIResponseTools({ clientTools, providerTools }: ProviderToolResponse) {
  const client = Object.entries(clientTools).map(([name, definition]) => ({
    name, // Tool/function name
    description: definition.description,
    type: 'function',
    parameters: definition.parameters,
  }))

  return [...client, ...providerTools]
}
