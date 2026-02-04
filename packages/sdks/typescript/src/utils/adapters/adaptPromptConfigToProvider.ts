import { getOpenAIResponseTools } from '$sdk/utils/adapters/openai/getFunctionTools'
import { ToolInputMap } from '$sdk/utils/adapters/types'
import type { Config } from '@latitude-data/constants/messages'
import { Adapters, ProviderAdapter } from 'promptl-ai'
import { getAIProviderTools } from './getProviderTools'

const ADAPTERS_WITH_SNAKE_CASE = [
  Adapters.openai.type,
  Adapters.openaiResponses.type,
  Adapters.anthropic.type,
]

/**
 * Configuration parameters in Latitude are defined using camelCase,
 * as it is explained in our documentation. This is done because it
 * is the API defined by Vercel. However, other LLM may use a different
 * naming for the same properties.
 */
export function adaptPromptConfigToProvider(
  config: Config,
  adapter: ProviderAdapter<object>,
): Config {
  if (config.tools) {
    config.tools = adaptToolsConfig(
      config.tools as ToolInputMap | ToolInputMap[],
      adapter,
    )
  }

  if (ADAPTERS_WITH_SNAKE_CASE.includes(adapter.type)) {
    return Object.keys(config).reduce((acc: Config, key: string) => {
      if (key in SNAKE_CASE_CONFIGURATION_ATTRIBUTES) {
        acc[SNAKE_CASE_CONFIGURATION_ATTRIBUTES[key]!] = config[key]
        delete acc[key]
      }
      return acc
    }, config)
  }

  return config
}

const SNAKE_CASE_CONFIGURATION_ATTRIBUTES: Record<string, string> = {
  maxTokens: 'max_tokens',
  topP: 'top_p',
  topK: 'top_k',
  presencePenalty: 'presence_penalty',
  stopSequences: 'stop_sequences',
  toolChoice: 'tool_choice',
}

export function adaptToolsConfig(
  tools: ToolInputMap | ToolInputMap[],
  adapter: ProviderAdapter<object>,
) {
  const { clientTools, providerTools } = getAIProviderTools({
    adapter: adapter,
    tools: Array.isArray(tools) ? Object.assign({}, ...tools) : tools,
  })

  if (adapter.type === Adapters.openai.type) {
    return Object.entries(clientTools).map(([name, definition]) => ({
      type: 'function',
      function: {
        name,
        ...definition,
      },
    }))
  }

  if (adapter.type === Adapters.openaiResponses.type) {
    return getOpenAIResponseTools({ clientTools, providerTools })
  }

  if (adapter == Adapters.anthropic) {
    return Object.entries(clientTools).map(([name, definition]) => {
      const { parameters, ...rest } = definition
      return {
        name,
        input_schema: parameters,
        ...rest,
      }
    })
  }

  // No manipulation needed for other adapters
  return tools
}
