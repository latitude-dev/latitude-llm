import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { TextStreamPart } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Workspace } from '../../schema/models/types/Workspace'
import { ErrorableEntity, LogSources, PromptSource } from '../../constants'
import { Providers } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
import * as aiModule from '../ai'
import * as ChainValidator from './ChainValidator'
import { runChain } from './run'
import { TelemetryContext } from '../../telemetry'
import { Chain, createChain, MessageRole } from 'promptl-ai'

let context: TelemetryContext
let providersMap: Map<string, any>
let workspace: Workspace
let promptSource: PromptSource
function buildMockAIresponse(chunks: TextStreamPart<any>[]) {
  return Result.ok({
    type: 'text' as const,
    text: new Promise((resolve) => resolve('MY TEXT')),
    usage: new Promise((resolve) =>
      resolve({
        inputTokens: 3,
        outputTokens: 7,
        totalTokens: 10,
      }),
    ),
    toolCalls: new Promise((resolve) => resolve([])),
    fullStream: new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk))
        controller.close()
      },
    }),
    providerName: Providers.OpenAI,
  } as aiModule.AIReturn<'text'>)
}

describe('run chain error handling', () => {
  const mockChain: Partial<Chain> = {
    step: vi.fn(),
    rawText: 'Test raw text',
  }

  beforeEach(async () => {
    vi.resetAllMocks()

    const {
      workspace: w,
      providers,
      documents,
      commit,
    } = await factories.createProject({
      providers: [
        { name: 'openai', type: Providers.OpenAI },
        { name: 'google', type: Providers.Google },
      ],
      documents: {
        'source-doc': factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    providersMap = new Map(providers.map((p) => [p.name, p]))
    workspace = w
    promptSource = { document: documents[0]!, commit }
    context = factories.createTelemetryContext({ workspace })

    vi.mocked(mockChain.step!)
      .mockResolvedValue({
        completed: false,
        messages: [
          {
            role: MessageRole.user,
            // @ts-expect-error - TODO(compiler): fix types
            content: [{ type: 'text', text: 'Test message' }],
          },
        ],
        config: { provider: 'openai', model: 'gpt-4o-mini' },
      })
      .mockResolvedValue({
        completed: true,
        messages: [],
        config: { provider: 'openai', model: 'gpt-4o-mini' },
      })
  })

  // TODO: troll test in CI
  it.skip('stores error when default provider quota is exceeded', async () => {
    const chainValidatorCall = vi
      .spyOn(ChainValidator, 'validateChain')
      .mockResolvedValueOnce(
        Result.error(
          new ChainError({
            code: RunErrorCodes.DefaultProviderExceededQuota,
            message:
              'You have reached the limit of free runs. Add your own provider (OpenAI, Anthropic, etc) in Settings → Providers.',
          }),
        ),
      )

    const run = runChain({
      context: context,
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      promptSource,
    })

    const error = await run.error
    expect(error).toEqual(
      new ChainError({
        code: RunErrorCodes.DefaultProviderExceededQuota,
        message: 'You have reached the limit of free runs. Add your own provider (OpenAI, Anthropic, etc) in Settings → Providers.',
      }),
    )
    expect(error?.dbError).toEqual({
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
    const chainValidatorCall = vi
      .spyOn(ChainValidator, 'validateChain')
      .mockResolvedValue(
        Result.error(
          new ChainError({
            code: RunErrorCodes.Unknown,
            message: 'Something undefined happened',
          }),
        ),
      )

    const run = runChain({
      context: context,
      workspace,
      chain: mockChain as Chain,
      providersMap,
      source: LogSources.API,
      promptSource,
    })

    const error = await run.error
    expect(error).toEqual(
      new ChainError({
        message: 'Something undefined happened',
        code: RunErrorCodes.Unknown,
      }),
    )
    chainValidatorCall.mockRestore()
  })

  it('store error when document config is wrong', async () => {
    const chain = createChain({
      prompt: 'Test prompt',
      parameters: {},
    })
    const run = runChain({
      context: context,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
      promptSource,
    })

    const error = await run.error
    expect(error).toEqual(
      new ChainError({
        code: RunErrorCodes.DocumentConfigError,
        message:
          '"model" attribute is required. Read more here: https://docs.latitude.so/guides/getting-started/providers#using-providers-in-prompts',
      }),
    )
  })

  it('store error when missing provider config is wrong', async () => {
    const chain = createChain({
      prompt: `
        ---
        provider: patata_provider
        model: gpt-4o-mini
        ---

        miau
      `,
      parameters: {},
    })
    const run = runChain({
      context: context,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
      promptSource,
    })

    const error = await run.error
    expect(error).toEqual(
      new ChainError({
        code: RunErrorCodes.MissingProvider,
        message:
          'Provider API Key with name patata_provider not found. Go to https://app.latitude.so/settings to add a new provider if there is not one already with that name.',
      }),
    )
  })

  it('store error when google prompt miss first user message', async () => {
    const chain = createChain({
      prompt: `
        ---
        provider: google
        model: gemini-something
        ---

        miau
      `,
      parameters: {},
    })
    const run = runChain({
      context: context,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
      promptSource,
    })

    const error = await run.error
    expect(error).toEqual(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: `There are rule violations:\n- Google requires at least one user message`,
      }),
    )
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
        model: gpt-4o-mini
        ---

        miau
      `,
      parameters: {},
    })
    const run = runChain({
      context: context,
      workspace,
      chain,
      providersMap,
      source: LogSources.API,
      promptSource,
    })
    const error = await run.error
    expect(error).toEqual(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: 'Openai returned this error: AI stream finished with error',
      }),
    )
  })
})
