import { Providers } from '@latitude-data/constants'

export const RUN_TEXT_RESPONSE = {
  uuid: 'a8f2e5d8-4c72-48c7-a6e0-23df3f1cbe2a', // Random
  conversation: [],
  response: {
    streamType: 'text' as const,
    text: 'some-text',
    input: [],
    output: [],
    model: 'gpt-4o',
    provider: Providers.OpenAI,
    cost: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    toolCalls: [],
  },
}
