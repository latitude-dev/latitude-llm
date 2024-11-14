import { defaultAdapter } from './adapter'
import { AnthropicAdapter } from './anthropic/adapter'
import { OpenAIAdapter } from './openai/adapter'

export type { ProviderAdapter } from './adapter'

export const Adapters = {
  default: defaultAdapter,
  openai: OpenAIAdapter,
  anthropic: AnthropicAdapter,
} as const

export type AdapterMessageType<
  T extends keyof typeof Adapters = keyof typeof Adapters,
> = ReturnType<(typeof Adapters)[T]['fromPromptl']>['messages'][number]
