import {
  Chain,
  ContentType,
  createChain,
  MessageRole,
} from '@latitude-data/compiler'
import { TextStreamPart } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Workspace } from '../../browser'
import {
  ErrorableEntity,
  LogSources,
  Providers,
  RunErrorCodes,
} from '../../constants'
import { Result } from '../../lib'
import * as factories from '../../tests/factories'
import * as aiModule from '../ai'
import { ChainError } from './ChainErrors'
import {
  AsyncStreamIteable,
  PARTIAL_FINISH_CHUNK,
  TOOLS,
} from './ChainStreamConsumer/consumeStream.test'
import { ChainValidator } from './ChainValidator'
import { runChain } from './run'

let providersMap: Map<string, any>

let workspace: Workspace
function buildMockAIresponse(chunks: TextStreamPart<TOOLS>[]) {
  return Result.ok({
    type: 'text' as 'text',
    data: {
      text: new Promise((resolve) => resolve('MY TEXT')),
      usage: new Promise((resolve) =>
        resolve({
          promptTokens: 3,
          completionTokens: 7,
          totalTokens: 10,
        }),
      ),
      toolCalls: new Promise((resolve) => resolve([])),
      fullStream: new AsyncStreamIteable({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(chunk))
          controller.close()
        },
      }),
    },
  } as aiModule.AIReturn<'text'>)
}

describe('run chain error handling', () => {
  const mockChain: Partial<Chain> = {
    step: vi.fn(),
    rawText: 'Test raw text',
  }

  beforeEach(async () => {
    vi.resetAllMocks()

    const { workspace: w, providers } = await factories.createProject({
      providers: [
        { name: 'openai', type: Providers.OpenAI },
        { name: 'google', type: Providers.Google },
      ],
    })
    providersMap = new Map(providers.map((p) => [p.name, p]))
    workspace = w

    vi.mocked(mockChain.step!).mockResolvedValue({
      completed: true,
      conversation: {
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Test message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-3.5-turbo' },
      },
    })
  })

  it('stores error when default provider quota is exceeded', async () => {
    const chainValidatorCall = vi.spyOn(ChainValidator.prototype, 'call')
    chainValidatorCall.mockImplementation(() =>
      Promise.resolve(
        Result.error(
          new ChainError({
            code: RunErrorCodes.DefaultProviderExceededQuota,
            message:
              'You have exceeded your maximum number of free runs for today',
          }),
        ),
      ),
    )
    const run = await runChain({
      errorableType: ErrorableEntity.DocumentLog,
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
    })

    const response = await run.response
    expect(response.error).toEqual(
      new ChainError({
        code: RunErrorCodes.DefaultProviderExceededQuota,
        message: 'You have exceeded your maximum number of free runs for today',
      }),
    )
    expect(response.error?.dbError).toEqual({
      id: expect.any(Number),
      errorableUuid: expect.any(String),
      errorableType: ErrorableEntity.DocumentLog,
      code: RunErrorCodes.DefaultProviderExceededQuota,
      message: 'You have exceeded your maximum number of free runs for today',
      details: {
        errorCode: RunErrorCodes.DefaultProviderExceededQuota,
      },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    chainValidatorCall.mockRestore()
  })

  it('store error as unknown when something undefined happens', async () => {
    const chainValidatorCall = vi.spyOn(ChainValidator.prototype, 'call')
    chainValidatorCall.mockImplementation(() =>
      // @ts-expect-error - Error is not valid here but we fake an unknown error
      Promise.resolve(Result.error(new Error('Something undefined happened'))),
    )
    const run = await runChain({
      errorableType: ErrorableEntity.DocumentLog,
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
    })

    const response = await run.response
    expect(response.error?.dbError).toEqual({
      id: expect.any(Number),
      errorableUuid: expect.any(String),
      errorableType: ErrorableEntity.DocumentLog,
      code: RunErrorCodes.Unknown,
      message: 'Something undefined happened',
      details: {
        errorCode: RunErrorCodes.Unknown,
      },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    chainValidatorCall.mockRestore()
  })

  it('store error when document config is wrong', async () => {
    const chain = createChain({
      prompt: 'Test prompt',
      parameters: {},
    })
    const run = await runChain({
      errorableType: ErrorableEntity.DocumentLog,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
    })

    const response = await run.response
    expect(response.error?.dbError).toEqual({
      id: expect.any(Number),
      errorableUuid: expect.any(String),
      errorableType: ErrorableEntity.DocumentLog,
      code: RunErrorCodes.DocumentConfigError,
      message:
        '"model" attribute is required. Read more here: https://docs.latitude.so/guides/getting-started/providers#using-providers-in-prompts',
      details: {
        errorCode: RunErrorCodes.DocumentConfigError,
      },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
  })

  it('store error when missing provider config is wrong', async () => {
    const chain = createChain({
      prompt: `
        ---
        provider: patata_provider
        model: gpt-3.5-turbo
        ---
      `,
      parameters: {},
    })
    const run = await runChain({
      errorableType: ErrorableEntity.DocumentLog,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
    })

    const response = await run.response
    expect(response.error?.dbError).toEqual({
      id: expect.any(Number),
      errorableUuid: expect.any(String),
      errorableType: ErrorableEntity.DocumentLog,
      code: RunErrorCodes.MissingProvider,
      message:
        'Provider API Key with name patata_provider not found. Go to https://app.latitude.so/settings to add a new provider if there is not one already with that name.',
      details: {
        errorCode: 'missing_provider_error',
      },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
  })

  it('store error when chain fail compiling', async () => {
    const chain = createChain({
      prompt: `
        ---
        provider: openai
        model: gpt-3.5-turbo
        ---
        <ref>NOT VALID TAG</ref>
      `,
      parameters: {},
    })
    const run = await runChain({
      errorableType: ErrorableEntity.DocumentLog,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
    })

    const response = await run.response
    expect(response.error?.dbError).toEqual({
      id: expect.any(Number),
      errorableUuid: expect.any(String),
      errorableType: ErrorableEntity.DocumentLog,
      code: RunErrorCodes.ChainCompileError,
      message: 'Error validating chain',
      details: {
        errorCode: RunErrorCodes.ChainCompileError,
        compileCode: 'unknown-tag',
        message: "Unknown tag: 'ref'",
      },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
  })

  it('store error when google prompt miss first user message', async () => {
    const chain = createChain({
      prompt: `
        ---
        provider: google
        model: gemini-something
        ---
      `,
      parameters: {},
    })
    const run = await runChain({
      errorableType: ErrorableEntity.DocumentLog,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
    })

    const response = await run.response
    expect(response.error?.dbError).toEqual({
      id: expect.any(Number),
      errorableUuid: expect.any(String),
      errorableType: ErrorableEntity.DocumentLog,
      code: RunErrorCodes.AIProviderConfigError,
      message: 'Google provider requires at least one user message',
      details: {
        errorCode: RunErrorCodes.AIProviderConfigError,
      },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
  })

  it('store error when AI provider stream finish with error', async () => {
    vi.spyOn(aiModule, 'ai').mockResolvedValue(
      buildMockAIresponse([
        {
          type: 'error',
          error: new Error('AI stream finished with error'),
        },
      ]),
    )
    const chain = createChain({
      prompt: `
        ---
        provider: openai
        model: gpt-3.5-turbo
        ---
      `,
      parameters: {},
    })
    const run = await runChain({
      errorableType: ErrorableEntity.DocumentLog,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
    })
    const response = await run.response
    expect(response.error?.dbError).toEqual({
      id: expect.any(Number),
      errorableUuid: expect.any(String),
      errorableType: ErrorableEntity.DocumentLog,
      code: RunErrorCodes.AIRunError,
      message: 'AI stream finished with error',
      details: {
        errorCode: RunErrorCodes.AIRunError,
      },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
  })

  it('returns a susscessful response', async () => {
    vi.spyOn(aiModule, 'ai').mockResolvedValue(
      buildMockAIresponse([
        {
          ...PARTIAL_FINISH_CHUNK,
          type: 'finish',
          finishReason: 'stop',
        },
      ]),
    )
    const chain = createChain({
      prompt: `
        ---
        provider: openai
        model: gpt-3.5-turbo
        ---
      `,
      parameters: {},
    })
    const run = await runChain({
      errorableType: ErrorableEntity.DocumentLog,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
    })
    const response = await run.response
    expect(response.value).toEqual({
      documentLogUuid: expect.any(String),
      streamType: 'text',
      text: 'MY TEXT',
      toolCalls: [],
      usage: {
        promptTokens: 3,
        completionTokens: 7,
        totalTokens: 10,
      },
      providerLog: expect.objectContaining({
        uuid: expect.any(String),
        documentLogUuid: expect.any(String),
        apiKeyId: null,
        config: { model: 'gpt-3.5-turbo', provider: 'openai' },
        costInMillicents: 1,
        duration: expect.any(Number),
        finishReason: 'stop',
        generatedAt: expect.any(Date),
        providerId: providersMap.get('openai').id,
        model: 'gpt-3.5-turbo',
        responseText: 'MY TEXT',
        responseObject: null,
        source: 'api',
        tokens: 10,
        toolCalls: [],
      }),
    })
  })
})
