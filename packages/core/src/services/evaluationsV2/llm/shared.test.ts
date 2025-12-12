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
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { type Commit } from '../../../schema/models/types/Commit'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { type ProviderLog } from '../../../schema/models/types/ProviderLog'
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
  let providerLog: ProviderLog

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

    await factories.createProviderLog({
      documentLogUuid: resultUuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4o',
      tokens: 31,
      duration: 1000,
      source: LogSources.Evaluation,
      costInMillicents: 500,
      workspace: workspace,
    })
    providerLog = await factories.createProviderLog({
      documentLogUuid: resultUuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4o',
      tokens: 31,
      duration: 1000,
      source: LogSources.Evaluation,
      costInMillicents: 500,
      workspace: workspace,
    })

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
              totalTokens: 20,
            },
            documentLogUuid: providerLog.documentLogUuid,
            providerLog: providerLog,
          }),
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
            totalTokens: 20,
          },
          documentLogUuid: providerLog.documentLogUuid,
          providerLog: providerLog,
        }),
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
            totalTokens: 20,
          },
          documentLogUuid: providerLog.documentLogUuid,
          providerLog: providerLog,
        }),
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
      resultUuid: 'resultUuid',
      evaluation: evaluation,
      providers: new Map([[provider.name, provider]]),
      commit: commit,
      workspace: workspace,
    })
    const chain = mocks.runChain.mock.calls[0][0].chain as Chain

    expect(result).toEqual({
      response: {
        streamType: 'object',
        object: { passed: true, reason: 'reason' },
        text: 'text',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        documentLogUuid: resultUuid,
        providerLog: providerLog,
      },
      stats: {
        documentLogUuid: resultUuid,
        tokens: 62,
        duration: 2000,
        costInMillicents: 1000,
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

  it('calls telemetry.prompt with projectId and all required parameters', async () => {
    const mockPrompt = vi
      .fn()
      .mockImplementation(realTelemetry.prompt.bind(realTelemetry))
    const mockTelemetry = {
      ...realTelemetry,
      prompt: mockPrompt,
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
      expect.anything(),
      expect.objectContaining({
        documentLogUuid: resultUuid,
        versionUuid: commit.uuid,
        promptUuid: evaluation.uuid,
        projectId: commit.projectId,
        template: prompt,
        parameters: parameters,
        source: LogSources.Evaluation,
      }),
    )
  })
})
