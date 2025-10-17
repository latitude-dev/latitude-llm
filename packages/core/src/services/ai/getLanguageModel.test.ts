import { Providers } from '@latitude-data/constants'
import { LanguageModel } from 'ai'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import * as factories from '../../tests/factories'
import { getLanguageModel } from './getLanguageModel'
import { LlmProvider } from './helpers'
import { VercelConfigWithProviderRules } from './providers/rules'

const GetLanguageModelMock = vi.hoisted(() => vi.fn())
const GetChatLanguageModelMock = vi.hoisted(() => vi.fn())
const MockLlmProvider = Object.assign(GetLanguageModelMock, {
  chat: GetChatLanguageModelMock,
}) as unknown as LlmProvider

let setup: Awaited<ReturnType<typeof factories.createProject>>
let openAIChatCompletionProvider: ProviderApiKey
let openAIResponsesProvider: ProviderApiKey
let anthropicProvider: ProviderApiKey

const config = {
  provider: Providers.OpenAI,
  model: 'gpt-4o',
  cacheControl: false,
  providerOptions: { openai: { apiKey: '123' } },
} satisfies VercelConfigWithProviderRules

describe('getLanguageModel', () => {
  beforeAll(async () => {
    setup = await factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai_chat_completion',
          configuration: { endpoint: 'chat_completions' },
        },
        {
          type: Providers.OpenAI,
          name: 'openai_responses',
          configuration: { endpoint: 'responses' },
        },
        {
          type: Providers.Anthropic,
          name: 'anthropic',
        },
      ],
    })
    openAIChatCompletionProvider = setup.providers[0]!
    openAIResponsesProvider = setup.providers[1]!
    anthropicProvider = setup.providers[2]!
  })

  it('returns custom language model', () => {
    const customLanguageModel = {
      model: 'im_custom',
    } as unknown as LanguageModel
    const model = getLanguageModel({
      provider: openAIChatCompletionProvider,
      model: 'gpt-4o',
      llmProvider: MockLlmProvider,
      config,
      customLanguageModel,
    })

    expect(model).toEqual({ model: 'im_custom' })
  })

  it('get model for OpenAI chat completions', () => {
    getLanguageModel({
      provider: openAIChatCompletionProvider,
      model: 'gpt-4o',
      llmProvider: MockLlmProvider,
      config,
    })

    expect(GetChatLanguageModelMock).toHaveBeenCalledWith('gpt-4o', {
      cacheControl: false,
      model: 'gpt-4o',
      provider: 'openai',
    })
  })

  it('get model for OpenAI responses', () => {
    getLanguageModel({
      provider: openAIResponsesProvider,
      model: 'gpt-4o',
      llmProvider: MockLlmProvider,
      config,
    })

    expect(GetLanguageModelMock).toHaveBeenCalledWith('gpt-4o', {
      cacheControl: false,
      model: 'gpt-4o',
      provider: 'openai',
    })
  })

  it('get model for Anthropic', () => {
    getLanguageModel({
      provider: anthropicProvider,
      model: 'claude-3-5-sonnet',
      llmProvider: MockLlmProvider,
      config: {
        ...config,
        provider: Providers.Anthropic,
        model: 'claude-3-5-sonnet',
      },
    })

    expect(GetLanguageModelMock).toHaveBeenCalledWith('claude-3-5-sonnet', {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      cacheControl: false,
    })
  })
})
