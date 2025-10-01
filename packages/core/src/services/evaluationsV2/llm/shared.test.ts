import { LogSources, Providers } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EvaluationType,
  EvaluationV2,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetric,
} from '../../../constants'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import {
  Commit,
  ProviderApiKey,
  ProviderLog,
  Workspace,
} from '../../../schema/types'
import * as factories from '../../../tests/factories'
import * as chains from '../../chains/run'
import { buildPrompt, promptSchema } from './binary'
import { runPrompt } from './shared'

describe('runPrompt', () => {
  let workspace: Workspace
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

    vi.spyOn(chains, 'runChain').mockImplementation((args) => {
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
    })
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
  })

  it('fails when running the prompt', async () => {
    vi.spyOn(chains, 'runChain').mockImplementation((args) => {
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
  })

  it('fails when verdict cannot be parsed from a normal response', async () => {
    vi.spyOn(chains, 'runChain').mockImplementation((args) => {
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
  })

  it('fails when verdict does not match the schema', async () => {
    vi.spyOn(chains, 'runChain').mockImplementation((args) => {
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
  })
})
