import { ChainEvent, LogSources, Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../../constants'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import * as factories from '../../../tests/factories'
import {
  telemetry as realTelemetry,
  type LatitudeTelemetry,
} from '../../../telemetry'
import * as chains from '../../chains/run'
import * as providerApiKeysMap from '../../providerApiKeys/buildMap'
import { buildStreamEvaluationRun } from './buildStreamEvaluationRun'

describe('buildStreamEvaluationRun', () => {
  let mocks: {
    runChain: MockInstance
    buildProvidersMap: MockInstance
  }

  let workspace: WorkspaceDto
  let provider: ProviderApiKey
  let evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Custom>

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
      metric: LlmEvaluationMetric.Custom,
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
        prompt: `---
provider: ${provider.name}
model: gpt-4o
---
Evaluate the response: {{ actualOutput }}`,
        minScore: 0,
        maxScore: 100,
      },
    })

    const mockUsage = {
      inputTokens: 10,
      outputTokens: 10,
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    }

    mocks = {
      buildProvidersMap: vi
        .spyOn(providerApiKeysMap, 'buildProvidersMap')
        .mockResolvedValue(new Map([[provider.name, provider]])),
      runChain: vi.spyOn(chains, 'runChain').mockReturnValue({
        uuid: 'test-uuid',
        resolvedContent: 'test content',
        conversation: { messages: Promise.resolve([]) },
        response: Promise.resolve({
          streamType: 'object' as const,
          object: { score: 50, reason: 'reason' },
          text: 'text',
          usage: mockUsage,
        }),
        messages: Promise.resolve([]),
        toolCalls: Promise.resolve([]),
        error: Promise.resolve(undefined),
        duration: Promise.resolve(1000),
        logUsage: Promise.resolve(mockUsage),
        runUsage: Promise.resolve(mockUsage),
        stream: new ReadableStream<ChainEvent>({
          start(controller) {
            controller.close()
          },
        }),
      }),
    }
  })

  it('passes source as LogSources.Evaluation to runChain', async () => {
    const result = await buildStreamEvaluationRun({
      workspace: workspace,
      evaluation: evaluation,
      parameters: {
        actualOutput: 'test output',
        conversation: 'test conversation',
      },
    })

    expect(result.ok).toBe(true)
    expect(mocks.runChain).toHaveBeenCalledOnce()
    const runChainArgs = mocks.runChain.mock.calls[0]![0]
    expect(runChainArgs.source).toBe(LogSources.Evaluation)
  })

  it('builds the stream evaluation run successfully', async () => {
    const result = await buildStreamEvaluationRun({
      workspace: workspace,
      evaluation: evaluation,
      parameters: {
        actualOutput: 'test output',
        conversation: 'test conversation',
      },
    })

    expect(result.ok).toBe(true)
    expect(result.value).toHaveProperty('streamHandler')
    expect(typeof result.value!.streamHandler).toBe('function')
  })

  it('calls telemetry.span.prompt with all required parameters', async () => {
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

    const parameters = {
      actualOutput: 'test output',
      conversation: 'test conversation',
    }

    await buildStreamEvaluationRun({
      workspace: workspace,
      evaluation: evaluation,
      parameters: parameters,
      telemetry: mockTelemetry,
    })

    expect(mockPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        promptUuid: evaluation.uuid,
        template: evaluation.configuration.prompt,
        parameters: parameters,
        source: LogSources.Evaluation,
      }),
      expect.anything(),
    )
  })
})
