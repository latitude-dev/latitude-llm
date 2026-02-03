import { Providers } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { type Message } from '@latitude-data/constants/messages'
import { APICallError } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import * as factories from '../../tests/factories'
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
    const { workspace } = await factories.createWorkspace()
    const context = factories.createTelemetryContext({ workspace })

    // @ts-expect-error - Incomplete provider for testing
    const provider: ProviderApiKey = {
      name: 'openai',
      provider: Providers.OpenAI,
      token: 'openai-api-key',
      url: 'https://api.openai.com',
    }

    const config = {
      model: 'test-model',
      provider: provider.name,
    }

    const messages: Message[] = [
      {
        role: 'system',
        content: [{ type: 'text', text: 'System message' }],
      },
      {
        role: 'assistant',
        toolCalls: [],
        content: [{ type: 'image', image: 'https://example.com/image.png' }],
      },
    ]

    const onError = vi.fn()

    await expect(
      ai({ context, provider, config, messages, onError }).then((r) =>
        r.unwrap(),
      ),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: `
There are rule violations:
- Assistant messages can only have text or tool call content.`.trim(),
      }),
    )
  })

  it('throw a ChainError when AI fails with APICallError', async () => {
    const { workspace } = await factories.createWorkspace()
    const context = factories.createTelemetryContext({ workspace })

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

    const onError = vi.fn()

    await expect(
      ai({
        context: context,
        provider: PROVIDER_PAYLOAD,
        config: { model: 'gpt-4o', provider: PROVIDER_PAYLOAD.name },
        messages: [],
        aiSdkProvider: {
          streamText: streamTextModk, // Inject the mocked function
        },
        onError,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: 'Error: API call error and response body: [RESPONSE_BODY]',
      }),
    )
  })

  it('throw a ChainError when AI fails with generic Error', async () => {
    const { workspace } = await factories.createWorkspace()
    const context = factories.createTelemetryContext({ workspace })

    const streamTextModk = vi.fn()
    streamTextModk.mockImplementation(() => {
      throw new Error('Some error')
    })

    const onError = vi.fn()

    await expect(
      ai({
        context: context,
        provider: PROVIDER_PAYLOAD,
        config: { model: 'gpt-4o', provider: PROVIDER_PAYLOAD.name },
        messages: [],
        aiSdkProvider: {
          streamText: streamTextModk,
        },
        onError,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: 'Unknown error: Some error',
      }),
    )
  })
})
