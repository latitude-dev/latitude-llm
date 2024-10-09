import {
  Chain,
  ContentType,
  createChain,
  MessageRole,
} from '@latitude-data/compiler'
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
import { ChainValidator } from './ChainValidator'
import { runChain } from './run'

let finishReason: string = 'stop'

function createMockAiResponse(text: string, totalTokens: number) {
  return Result.ok({
    type: 'text' as 'text',
    data: {
      text: Promise.resolve(text),
      usage: Promise.resolve({ totalTokens }),
      toolCalls: Promise.resolve([]),
      providerLog: Promise.resolve({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
      }),
      fullStream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-delta', textDelta: text })
          controller.enqueue({ type: 'finish', finishReason })
          controller.close()
        },
      }),
    },
  })
}

let providersMap: Map<string, any>

let workspace: Workspace

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
    /* const mockAiResponse = createMockAiResponse('AI response', 10) */
    /* vi.spyOn(aiModule, 'ai').mockResolvedValue(mockAiResponse as any) */

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
      details: null,
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
      details: null,
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
      details: null,
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
      details: null,
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
      details: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
  })
})
