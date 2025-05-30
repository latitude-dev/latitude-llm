import { AGENT_RETURN_TOOL_NAME } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EvaluationType,
  EvaluationV2,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetric,
  LogSources,
  ProviderApiKey,
  ProviderLog,
  Providers,
  Workspace,
} from '../../../browser'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import * as factories from '../../../tests/factories'
import * as agents from '../../agents/run'
import * as chains from '../../chains/run'
import { buildPrompt, promptSchema } from './binary'
import { runPrompt } from './shared'

describe('runPrompt', () => {
  let workspace: Workspace
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
      commit,
      providers,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: { prompt: 'prompt' },
    })

    workspace = w
    provider = providers[0]!

    evaluation = await factories.createEvaluationV2({
      document: documents[0]!,
      commit: commit,
      workspace: workspace,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
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
        lastResponse: Promise.resolve({
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
        workspace: workspace,
      }),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.ChainCompileError,
        message: `Unexpected EOF. Expected '}}' but did not find it. (1:17)
1: {{ invalid_prompt

                    ^`,
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
        lastResponse: Promise.resolve(undefined),
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
        lastResponse: Promise.resolve({
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
        workspace: workspace,
      }),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: 'Evaluation conversation response is not an object',
      }),
    )
  })

  it('fails when verdict cannot be parsed from an agent response', async () => {
    vi.spyOn(agents, 'runAgent').mockImplementation((args) => {
      ;(args.chain as any)._completed = true

      return {
        errorableUuid: resultUuid,
        error: Promise.resolve(undefined),
        lastResponse: Promise.resolve({
          streamType: 'text',
          text: 'text',
          toolCalls: [
            {
              id: 'id',
              name: 'get_weather',
              arguments: { city: 'London' },
            },
          ],
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

    const parts = prompt.split('---')
    prompt = [
      parts.slice(0, 1),
      prompt.split('---')[1] + 'type: agent\n',
      parts.slice(2),
    ].join('---')

    await expect(
      runPrompt({
        prompt: prompt,
        parameters: parameters,
        schema: promptSchema,
        resultUuid: 'resultUuid',
        evaluation: evaluation,
        providers: new Map([[provider.name, provider]]),
        workspace: workspace,
      }),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: 'Evaluation conversation response is not an agent return call',
      }),
    )
  })

  it('fails when verdict does not match the schema', async () => {
    vi.spyOn(chains, 'runChain').mockImplementation((args) => {
      ;(args.chain as any)._completed = true

      return {
        errorableUuid: resultUuid,
        error: Promise.resolve(undefined),
        lastResponse: Promise.resolve({
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
        workspace: workspace,
      }),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: `[
  {
    "code": "invalid_type",
    "expected": "boolean",
    "received": "undefined",
    "path": [
      "passed"
    ],
    "message": "Required"
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

  it('succeeds when running an agent prompt', async () => {
    vi.spyOn(agents, 'runAgent').mockImplementation((args) => {
      ;(args.chain as any)._completed = true

      return {
        errorableUuid: resultUuid,
        error: Promise.resolve(undefined),
        lastResponse: Promise.resolve({
          streamType: 'text',
          text: 'text',
          toolCalls: [
            {
              id: 'id',
              name: AGENT_RETURN_TOOL_NAME,
              arguments: { passed: true, reason: 'reason' },
            },
          ],
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

    const parts = prompt.split('---')
    prompt = [
      parts.slice(0, 1),
      prompt.split('---')[1] + 'type: agent\n',
      parts.slice(2),
    ].join('---')

    const result = await runPrompt({
      prompt: prompt,
      parameters: parameters,
      schema: promptSchema,
      resultUuid: 'resultUuid',
      evaluation: evaluation,
      providers: new Map([[provider.name, provider]]),
      workspace: workspace,
    })

    expect(result).toEqual({
      response: {
        streamType: 'text',
        text: 'text',
        toolCalls: [
          {
            id: 'id',
            name: AGENT_RETURN_TOOL_NAME,
            arguments: { passed: true, reason: 'reason' },
          },
        ],
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
