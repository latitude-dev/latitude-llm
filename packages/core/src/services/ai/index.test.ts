import { ContentType, type Message, MessageRole } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { APICallError } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { ProviderApiKey, Providers } from '../../browser'
import { ChainError } from '../../lib/chainStreamManager/ChainErrors'
import { ai } from './index'

const PROVIDER_PAYLOAD: ProviderApiKey = {
  id: 33,
  authorId: '1',
  workspaceId: 1,
  provider: Providers.OpenAI,
  name: 'openai',
  token: 'fake-openai-api-key',
  url: 'https://api.openai.com',
  defaultModel: null,
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  configuration: null,
}

describe('ai function', () => {
  it('should throw an error if rules are violated', async () => {
    // @ts-expect-error
    const provider: ProviderApiKey = {
      provider: Providers.OpenAI,
      token: 'openai-api-key',
      url: 'https://api.openai.com',
    }

    const config = {
      model: 'test-model',
    }

    const messages: Message[] = [
      {
        role: MessageRole.system,
        content: [{ type: ContentType.text, text: 'System message' }],
      },
      {
        role: MessageRole.assistant,
        toolCalls: [],
        content: [
          { type: ContentType.image, image: 'https://example.com/image.png' },
        ],
      },
    ]

    await expect(
      ai({ provider, config, messages }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: `
There are rule violations:
- Assistant messages can only have text or tool call content.`.trim(),
      }),
    )
  })

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
      {
        role: MessageRole.system,
        content: [{ type: ContentType.text, text: 'System message' }],
      },
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
    streamTextModk.mockImplementation(() => {
      throw new APICallError({
        message: 'API call error',
        url: 'https://api.openai.com',
        responseBody: '[RESPONSE_BODY]',
        requestBodyValues: {
          something: 'value',
        },
      })
    })

    await expect(
      ai({
        provider: PROVIDER_PAYLOAD,
        config: { model: 'gpt-4o' },
        messages: [],
        aiSdkProvider: {
          streamText: streamTextModk, // Inject the mocked function
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
    streamTextModk.mockImplementation(() => {
      throw new Error('Some error')
    })

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
})
