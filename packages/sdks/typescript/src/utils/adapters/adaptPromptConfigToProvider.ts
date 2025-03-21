import type { Config } from '@latitude-data/compiler'
import { ToolDefinitionsMap } from '@latitude-data/constants/ai'
import { Adapters, ProviderAdapter } from 'promptl-ai'

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
      config.tools as ToolDefinitionsMap | ToolDefinitionsMap[],
      adapter,
    )
  }

  if (adapter == Adapters.openai || adapter == Adapters.anthropic) {
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
  tools: ToolDefinitionsMap | ToolDefinitionsMap[],
  adapter: ProviderAdapter<object>,
): object {
  if (Array.isArray(tools)) {
    tools = Object.assign({}, ...tools) as ToolDefinitionsMap
  }

  if (adapter == Adapters.openai) {
    return Object.entries(tools).map(([name, definition]) => ({
      type: 'function',
      function: {
        name,
        ...definition,
      },
    }))
  }

  if (adapter == Adapters.anthropic) {
    return Object.entries(tools).map(([name, definition]) => {
      const { parameters, ...rest } = definition
      return {
        name,
        input_schema: parameters,
        ...rest,
      }
    })
  }

  return tools
}
