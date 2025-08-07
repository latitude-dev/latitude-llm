import { ToolInputMap } from '$sdk/utils/adapters/types'
import { Adapters, ProviderAdapter } from 'promptl-ai'
import { getOpenAIResponsesBuiltinTools } from './openai/getOpenAIResponsesBuiltinTools'

export function getAIProviderTools({
  adapter,
  tools,
}: {
  adapter: ProviderAdapter<object>
  tools: ToolInputMap
}) {
  if (adapter.type === Adapters.openaiResponses.type) {
    return getOpenAIResponsesBuiltinTools({ tools })
  }

  return {
    clientTools: tools,
    providerTools: [],
  }
}

export type ProviderToolResponse = ReturnType<typeof getAIProviderTools>
