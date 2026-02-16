import { LogSources, Providers } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Chain } from 'promptl-ai'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  EvaluationType,
  EvaluationV2,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetric,
} from '../../../constants'
import { estimateCost } from '../../ai'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { type Commit } from '../../../schema/models/types/Commit'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import {
  telemetry as realTelemetry,
  type LatitudeTelemetry,
} from '../../../telemetry'
import * as chains from '../../chains/run'
import { buildPrompt, promptSchema } from './binary'
import { runPrompt } from './shared'

describe('runPrompt', () => {
  let mocks: {
    runChain: MockInstance
  }

  let workspace: WorkspaceDto
  let commit: Commit
  let provider: ProviderApiKey
  let evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>
  let resultUuid: string
  let prompt: string
  let parameters: Record<string, unknown>
  const totalTokens = 20

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()

    const {
      workspace: w,
      documents,
      commit: c,
      providers,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: { prompt: 'prompt' },
    })

    workspace = w
    commit = c
    provider = providers[0]!

    evaluation = await factories.createEvaluationV2({
      document: documents[0]!,
      commit: commit,
      workspace: workspace,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        provider: provider.name,
        model: 'gpt-4o',
        criteria: 'criteria',
        passDescription: 'pass',
        failDescription: 'fail',
      },
    })
    resultUuid = generateUUIDIdentifier()

    prompt = buildPrompt({ ...evaluation.configuration, provider })
    parameters = Object.fromEntries(
      LLM_EVALUATION_PROMPT_PARAMETERS.map((p) => [p, p]),
    )
    mocks = {
      runChain: vi.spyOn(chains, 'runChain').mockImplementation((args) => {
        ;(args.chain as any)._completed = true

        return {
          errorableUuid: resultUuid,
          error: Promise.resolve(undefined),
          response: Promise.resolve({
            streamType: 'object',
            object: { passed: true, reason: 'reason' },
            text: 'text',
            usage: {
              promptTokens: 10,
              completionTokens: 10,
              totalTokens,
            },
            documentLogUuid: resultUuid,
          }),
          duration: Promise.resolve(2000),
        } as any
      }),
    }
  })

  it('fails when compiling the prompt', async () => {
    await expect(
      runPrompt({
        prompt: '{{ invalid_prompt',
        parameters: parameters,
        schema: promptSchema,
        resultUuid: 'resultUuid',
        evaluation: evaluation,
        providers: new Map([[provider.name, provider]]),
        commit: commit,
        workspace: workspace,
      }),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.ChainCompileError,
        message: `Unexpected EOF. Expected '}}' but did not find it.`,
      }),
    )

    expect(mocks.runChain).not.toHaveBeenCalled()
  })

  it('fails when running the prompt', async () => {
    mocks.runChain = vi.spyOn(chains, 'runChain').mockImplementation((args) => {
      ;(args.chain as any)._completed = true

      return {
        errorableUuid: resultUuid,
        error: Promise.resolve(
          new ChainError({
            code: RunErrorCodes.AIRunError,
            message: `Failed!`,
          }),
        ),
        response: Promise.resolve(undefined),
      } as any
    })

    await expect(
      runPrompt({
        prompt: prompt,
        parameters: parameters,
        schema: promptSchema,
        resultUuid: 'resultUuid',
        evaluation: evaluation,
        providers: new Map([[provider.name, provider]]),
        commit: commit,
        workspace: workspace,
      }),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIRunError,
        message: 'Failed!',
      }),
    )

    expect(mocks.runChain).toHaveBeenCalled()
  })

  it('fails when verdict cannot be parsed from a normal response', async () => {
    mocks.runChain = vi.spyOn(chains, 'runChain').mockImplementation((args) => {
      ;(args.chain as any)._completed = true

      return {
        errorableUuid: resultUuid,
        error: Promise.resolve(undefined),
        response: Promise.resolve({
          streamType: 'text',
          text: 'text',
          toolCalls: [],
          usage: {
            promptTokens: 10,
            completionTokens: 10,
            totalTokens,
          },
          documentLogUuid: resultUuid,
        }),
        duration: Promise.resolve(2000),
      } as any
    })

    await expect(
      runPrompt({
        prompt: prompt,
        parameters: parameters,
        schema: promptSchema,
        resultUuid: 'resultUuid',
        evaluation: evaluation,
        providers: new Map([[provider.name, provider]]),
        commit: commit,
        workspace: workspace,
      }),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: 'Evaluation conversation response is not an object',
      }),
    )

    expect(mocks.runChain).toHaveBeenCalled()
  })

  it('fails when verdict does not match the schema', async () => {
    mocks.runChain = vi.spyOn(chains, 'runChain').mockImplementation((args) => {
      ;(args.chain as any)._completed = true

      return {
        errorableUuid: resultUuid,
        error: Promise.resolve(undefined),
        response: Promise.resolve({
          streamType: 'object',
          object: { score: 0.5, reason: 'reason' },
          text: 'text',
          usage: {
            promptTokens: 10,
            completionTokens: 10,
            totalTokens,
          },
          documentLogUuid: resultUuid,
        }),
        duration: Promise.resolve(2000),
      } as any
    })

    await expect(
      runPrompt({
        prompt: prompt,
        parameters: parameters,
        schema: promptSchema,
        resultUuid: 'resultUuid',
        evaluation: evaluation,
        providers: new Map([[provider.name, provider]]),
        commit: commit,
        workspace: workspace,
      }),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: `[
  {
    "expected": "boolean",
    "code": "invalid_type",
    "path": [
      "passed"
    ],
    "message": "Invalid input: expected boolean, received undefined"
  }
]`,
      }),
    )

    expect(mocks.runChain).toHaveBeenCalled()
  })

  it('succeeds when running a normal prompt', async () => {
    const result = await runPrompt({
      prompt: prompt,
      parameters: parameters,
      schema: promptSchema,
      resultUuid: resultUuid,
      evaluation: evaluation,
      providers: new Map([[provider.name, provider]]),
      commit: commit,
      workspace: workspace,
    })
    const chain = mocks.runChain.mock.calls[0][0].chain as Chain
    const expectedCost = Math.floor(
      estimateCost({
        provider: provider.provider,
        model: 'gpt-4o',
        usage: {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens,
        } as any,
      }) * 100_000,
    )

    expect(result).toEqual({
      response: {
        streamType: 'object',
        object: { passed: true, reason: 'reason' },
        text: 'text',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens },
        documentLogUuid: resultUuid,
      },
      stats: {
        documentLogUuid: resultUuid,
        tokens: totalTokens,
        duration: 2000,
        costInMillicents: expectedCost,
      },
      verdict: { passed: true, reason: 'reason' },
    })
    expect(mocks.runChain).toHaveBeenCalledOnce()
    expect(chain.rawText.includes('structuredOutputs: true')).toBe(true)
    expect(chain.rawText.includes('strictJsonSchema: true')).toBe(true)
  })

  it('passes source as LogSources.Evaluation to runChain', async () => {
    await runPrompt({
      prompt: prompt,
      parameters: parameters,
      schema: promptSchema,
      resultUuid: 'resultUuid',
      evaluation: evaluation,
      providers: new Map([[provider.name, provider]]),
      commit: commit,
      workspace: workspace,
    })

    expect(mocks.runChain).toHaveBeenCalledOnce()
    const runChainArgs = mocks.runChain.mock.calls[0][0]
    expect(runChainArgs.source).toBe(LogSources.Evaluation)
  })

  it('calls telemetry.span.prompt with projectId and all required parameters', async () => {
    const mockPrompt = vi
      .fn()
      .mockImplementation(realTelemetry.span.prompt.bind(realTelemetry.span))
    const mockTelemetry = {
      ...realTelemetry,
      span: {
        ...realTelemetry.span,
        prompt: mockPrompt,
      },
    } as unknown as LatitudeTelemetry

    await runPrompt({
      prompt: prompt,
      parameters: parameters,
      schema: promptSchema,
      resultUuid: resultUuid,
      evaluation: evaluation,
      providers: new Map([[provider.name, provider]]),
      commit: commit,
      workspace: workspace,
      telemetry: mockTelemetry,
    })

    expect(mockPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        template: prompt,
        parameters: parameters,
      }),
      expect.anything(),
    )
  })
})
