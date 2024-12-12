import type { Config } from '@latitude-data/compiler'
import { Adapters, ProviderAdapter } from '@latitude-data/promptl'

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
