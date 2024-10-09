import { Message, MessageRole } from '@latitude-data/compiler'
import { APICallError } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { ProviderApiKey, Providers, RunErrorCodes } from '../../browser'
import { ChainError } from '../chains/ChainErrors'
import { ai } from './index'

const PROVIDER_PAYLOAD: ProviderApiKey = {
  id: 33,
  authorId: '1',
  workspaceId: 1,
  provider: Providers.OpenAI,
  name: 'openai',
  token: 'fake-openai-api-key',
  url: 'https://api.openai.com',
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}
describe('ai function', () => {
  it('should throw an error if Google provider is used without a user message', async () => {
    // @ts-expect-error
    const provider: ProviderApiKey = {
      provider: Providers.Google,
      token: 'google-api-key',
      url: 'https://api.google.com',
    }

    const config = {
      model: 'test-model',
    }

    const messages: Message[] = [
      { role: MessageRole.system, content: 'System message' },
    ]

    await expect(
      ai({ provider, config, messages }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIProviderConfigError,
        message: 'Google provider requires at least one user message',
      }),
    )
  })

  it('throw a ChainError when AI fails with APICallError', async () => {
    const streamTextModk = vi.fn()
    streamTextModk.mockRejectedValue(
      new APICallError({
        message: 'API call error',
        url: 'https://api.openai.com',
        responseBody: '[RESPONSE_BODY]',
        requestBodyValues: {
          something: 'value',
        },
      }),
    )
    await expect(
      ai({
        provider: PROVIDER_PAYLOAD,
        config: { model: 'gpt-4o' },
        messages: [],
        aiSdkProvider: {
          streamText: streamTextModk,
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: 'Error: API call error and response body: [RESPONSE_BODY]',
      }),
    )
  })

  it('throw a ChainError when AI fails with generic Error', async () => {
    const streamTextModk = vi.fn()
    streamTextModk.mockRejectedValue(new Error('Some error'))

    await expect(
      ai({
        provider: PROVIDER_PAYLOAD,
        config: { model: 'gpt-4o' },
        messages: [],
        aiSdkProvider: {
          streamText: streamTextModk,
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: 'Unknown error: Some error',
      }),
    )
  })

  it('throw a ChainError when AI fails with unknow Error', async () => {
    const streamTextModk = vi.fn()
    streamTextModk.mockRejectedValue('something weird')

    await expect(
      ai({
        provider: PROVIDER_PAYLOAD,
        config: { model: 'gpt-4o' },
        messages: [],
        aiSdkProvider: {
          streamText: streamTextModk,
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: 'Unknown error: something weird',
      }),
    )
  })
})
