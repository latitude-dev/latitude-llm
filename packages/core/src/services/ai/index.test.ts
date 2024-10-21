import { ContentType, Message, MessageRole } from '@latitude-data/compiler'
import { APICallError, CoreTool, ObjectStreamPart, TextStreamPart } from 'ai'
import { MockLanguageModelV1 } from 'ai/test'
import { JSONSchema7 } from 'json-schema'
import { describe, expect, it, vi } from 'vitest'

import { ProviderApiKey, Providers, RunErrorCodes } from '../../browser'
import { streamToGenerator } from '../../lib/streamToGenerator'
import { ChainError } from '../chains/ChainErrors'
import { ai } from './index'
import { UNSUPPORTED_STREAM_MODELS } from './providers/models'

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

  describe('non-streaming models', () => {
    it('should process generateText as text stream', async () => {
      const customLanguageModel = new MockLanguageModelV1({
        doGenerate: async () => {
          return {
            rawCall: { rawPrompt: null, rawSettings: {} },
            text: 'Hello, world!',
            finishReason: 'stop',
            usage: {
              promptTokens: 1,
              completionTokens: 1,
            },
          }
        },
      })

      // @ts-expect-error
      const provider: ProviderApiKey = {
        provider: Providers.OpenAI,
        token: 'openai-api-key',
        url: 'https://api.openai.com',
      }

      const config = {
        model: UNSUPPORTED_STREAM_MODELS[0] as string,
      }

      const messages: Message[] = [
        { role: MessageRole.system, content: 'System message' },
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Hello' }],
        },
      ]

      const result = await ai({
        provider,
        config,
        messages,
        customLanguageModel,
      })

      const unwrappedResult = result.unwrap()
      expect(unwrappedResult.type).toEqual('text')

      const chunks = []

      for await (const chunk of streamToGenerator<
        TextStreamPart<Record<string, CoreTool>> | ObjectStreamPart<unknown>
      >(unwrappedResult.data.fullStream)) {
        const textChunk = chunk as {
          type: 'text-delta' | 'finish'
          textDelta?: string
          finishReason?: string
          usage?: {
            promptTokens: number
            completionTokens: number
            totalTokens: number
          }
        }

        chunks.push(textChunk)
      }

      expect(chunks[0]).toEqual({
        type: 'text-delta',
        textDelta: 'Hello, world!',
      })

      expect(chunks[1]?.type).toEqual('finish')
      expect(chunks[1]?.finishReason).toEqual('stop')
      expect(chunks[1]?.usage).toEqual({
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      })
    })

    it('should process generateObject as object stream', async () => {
      const customLanguageModel = new MockLanguageModelV1({
        defaultObjectGenerationMode: 'json',
        doGenerate: async () => {
          return {
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `{"content":"Hello, world!"}`,
          }
        },
      })

      // @ts-expect-error
      const provider: ProviderApiKey = {
        provider: Providers.OpenAI,
        token: 'openai-api-key',
        url: 'https://api.openai.com',
      }

      const config = {
        model: UNSUPPORTED_STREAM_MODELS[0] as string,
      }

      const messages: Message[] = [
        { role: MessageRole.system, content: 'System message' },
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Hello' }],
        },
      ]

      const output = 'object'
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          content: { type: 'string' },
        },
      }

      const result = await ai({
        provider,
        config,
        messages,
        output,
        schema,
        customLanguageModel,
      })

      const unwrappedResult = result.unwrap()
      expect(unwrappedResult.type).toEqual('object')

      const chunks = []

      for await (const chunk of streamToGenerator<
        TextStreamPart<Record<string, CoreTool>> | ObjectStreamPart<unknown>
      >(unwrappedResult.data.fullStream)) {
        const objectChunk = chunk as {
          type: 'object' | 'finish'
          object?: Object
          finishReason?: string
          usage?: {
            promptTokens: number
            completionTokens: number
            totalTokens: number
          }
        }

        chunks.push(objectChunk)
      }

      expect(chunks[0]).toEqual({
        type: 'object',
        object: { content: 'Hello, world!' },
      })

      expect(chunks[1]?.type).toEqual('finish')
      expect(chunks[1]?.finishReason).toEqual('stop')
      expect(chunks[1]?.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      })
    })
  })
})
