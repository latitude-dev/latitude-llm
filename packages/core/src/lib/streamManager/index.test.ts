import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@latitude-data/constants'
import { LegacyVercelSDKVersion4Usage as LanguageModelUsage } from '@latitude-data/constants/ai'
import {
  CostBreakdown,
  totalCost,
  totalInputTokens,
} from '@latitude-data/constants/costs'
import { LogSources } from '../../constants'
import { incrementTokens, StreamManager, StreamManagerProps } from './index'
import * as estimateCostModule from '../../services/ai/estimateCost'

vi.spyOn(estimateCostModule, 'estimateCostBreakdown')

class TestStreamManager extends StreamManager {
  async step() {}

  public get $provider() {
    return this.provider
  }
  public get $model() {
    return this.model
  }
  public $startProviderStep = this.startProviderStep.bind(this)
  public $incrementLogUsage = this.incrementLogUsage.bind(this)
  public $incrementLogCost = this.incrementLogCost.bind(this)
  public $incrementRunCostFromUsage = this.incrementRunCostFromUsage.bind(this)
  public $updateStateFromResponse = this.updateStateFromResponse.bind(this)
  public $startStream = this.startStream.bind(this)
  public $endStream = this.endStream.bind(this)
}

const createUsage = (multiplier: number = 1): LanguageModelUsage => ({
  inputTokens: 100 * multiplier,
  outputTokens: 50 * multiplier,
  promptTokens: 100 * multiplier,
  completionTokens: 50 * multiplier,
  totalTokens: 150 * multiplier,
  reasoningTokens: 10 * multiplier,
  cachedInputTokens: 5 * multiplier,
})

describe('incrementTokens', () => {
  it('adds tokens when prev is undefined', () => {
    const next = createUsage()
    const result = incrementTokens({ prev: undefined, next })

    expect(result).toEqual(next)
  })

  it('adds tokens when prev has values', () => {
    const prev = createUsage(1)
    const next = createUsage(2)
    const result = incrementTokens({ prev, next })

    expect(result).toEqual({
      inputTokens: 300,
      outputTokens: 150,
      promptTokens: 300,
      completionTokens: 150,
      totalTokens: 450,
      reasoningTokens: 30,
      cachedInputTokens: 15,
    })
  })

  it('handles zero values correctly', () => {
    const prev: LanguageModelUsage = {
      inputTokens: 0,
      outputTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    }
    const next = createUsage()
    const result = incrementTokens({ prev, next })

    expect(result).toEqual(next)
  })
})

describe('StreamManager', () => {
  let streamManager: TestStreamManager
  let defaultProps: StreamManagerProps

  beforeEach(() => {
    vi.clearAllMocks()

    defaultProps = {
      workspace: { id: 1, name: 'test' } as any,
      promptSource: {
        commit: { uuid: 'commit-uuid' },
        document: { documentUuid: 'doc-uuid' },
      } as any,
      source: LogSources.API,
      context: {} as any,
    }

    streamManager = new TestStreamManager(defaultProps)
  })

  describe('startProviderStep', () => {
    it('stores provider and model', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any

      await streamManager.$startProviderStep({ config, provider })

      expect(streamManager.$provider).toBe(provider)
      expect(streamManager.$model).toBe('gpt-4')
    })
  })

  describe('incrementLogUsage', () => {
    it('increments log usage', async () => {
      const { logUsage } = streamManager.prepare()

      streamManager.$startStream()
      streamManager.$incrementLogUsage(createUsage(1))
      streamManager.$incrementLogUsage(createUsage(2))
      streamManager.$endStream()

      await expect(logUsage).resolves.toEqual({
        inputTokens: 300,
        outputTokens: 150,
        promptTokens: 300,
        completionTokens: 150,
        totalTokens: 450,
        reasoningTokens: 30,
        cachedInputTokens: 15,
      })
    })
  })

  describe('incrementRunUsage', () => {
    it('increments run usage', async () => {
      const { runUsage } = streamManager.prepare()

      streamManager.$startStream()
      streamManager.incrementRunUsage(createUsage(1))
      streamManager.incrementRunUsage(createUsage(3))
      streamManager.$endStream()

      await expect(runUsage).resolves.toEqual({
        inputTokens: 400,
        outputTokens: 200,
        promptTokens: 400,
        completionTokens: 200,
        totalTokens: 600,
        reasoningTokens: 40,
        cachedInputTokens: 20,
      })
    })
  })

  describe('cost tracking', () => {
    const mockBreakdown: CostBreakdown = {
      'openai/gpt-4': {
        input: {
          prompt: { tokens: 100, cost: 0.003 },
          cached: { tokens: 0 },
        },
        output: {
          reasoning: { tokens: 0 },
          completion: { tokens: 50, cost: 0.007 },
        },
      },
    }

    beforeEach(() => {
      vi.mocked(estimateCostModule.estimateCostBreakdown).mockReturnValue(
        mockBreakdown,
      )
    })

    it('incrementLogCost calculates cost using estimateCostBreakdown', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any
      const usage = createUsage()

      const { logCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })
      streamManager.$incrementLogCost({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage,
      })
      streamManager.$endStream()

      expect(estimateCostModule.estimateCostBreakdown).toHaveBeenCalledWith({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage,
      })
      const resolved = await logCost
      expect(totalCost(resolved)).toBeCloseTo(0.01)
      expect(resolved).toEqual(mockBreakdown)
    })

    it('incrementRunCostFromUsage calculates cost using estimateCostBreakdown', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any
      const usage = createUsage()

      const { runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })
      streamManager.$incrementRunCostFromUsage({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage,
      })
      streamManager.$endStream()

      expect(estimateCostModule.estimateCostBreakdown).toHaveBeenCalledWith({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage,
      })
      const resolved = await runCost
      expect(totalCost(resolved)).toBeCloseTo(0.01)
    })

    it('incrementRunCost adds pre-computed breakdown directly', async () => {
      const breakdown1: CostBreakdown = {
        'openai/gpt-4': {
          input: {
            prompt: { tokens: 100, cost: 0.02 },
            cached: { tokens: 0 },
          },
          output: {
            reasoning: { tokens: 0 },
            completion: { tokens: 50, cost: 0.03 },
          },
        },
      }
      const breakdown2: CostBreakdown = {
        'anthropic/claude-sonnet-3-5': {
          input: {
            prompt: { tokens: 80, cost: 0.01 },
            cached: { tokens: 0 },
          },
          output: {
            reasoning: { tokens: 0 },
            completion: { tokens: 40, cost: 0.02 },
          },
        },
      }

      const { runCost } = streamManager.prepare()
      streamManager.$startStream()
      streamManager.incrementRunCost(breakdown1)
      streamManager.incrementRunCost(breakdown2)
      streamManager.$endStream()

      const resolved = await runCost
      expect(totalCost(resolved)).toBeCloseTo(0.08)
      expect(resolved['openai/gpt-4']).toEqual(breakdown1['openai/gpt-4'])
      expect(resolved['anthropic/claude-sonnet-3-5']).toEqual(
        breakdown2['anthropic/claude-sonnet-3-5'],
      )
    })

    it('accumulates costs from multiple calls', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any

      const subAgentBreakdown: CostBreakdown = {
        'anthropic/claude-sonnet-3-5': {
          input: {
            prompt: { tokens: 200, cost: 0.02 },
            cached: { tokens: 0 },
          },
          output: {
            reasoning: { tokens: 0 },
            completion: { tokens: 100, cost: 0.03 },
          },
        },
      }

      const { logCost, runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      streamManager.$incrementLogCost({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage: createUsage(),
      })
      streamManager.$incrementLogCost({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage: createUsage(),
      })

      streamManager.$incrementRunCostFromUsage({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage: createUsage(),
      })
      streamManager.incrementRunCost(subAgentBreakdown)

      streamManager.$endStream()

      const resolvedLogCost = await logCost
      expect(totalCost(resolvedLogCost)).toBeCloseTo(0.02)

      const resolvedRunCost = await runCost
      expect(totalCost(resolvedRunCost)).toBeCloseTo(0.06)
      expect(resolvedRunCost['anthropic/claude-sonnet-3-5']).toEqual(
        subAgentBreakdown['anthropic/claude-sonnet-3-5'],
      )
    })
  })

  describe('updateStateFromResponse', () => {
    const mockBreakdown: CostBreakdown = {
      'openai/gpt-4': {
        input: {
          prompt: { tokens: 100, cost: 0.003 },
          cached: { tokens: 0 },
        },
        output: {
          reasoning: { tokens: 0 },
          completion: { tokens: 50, cost: 0.007 },
        },
      },
    }

    beforeEach(() => {
      vi.mocked(estimateCostModule.estimateCostBreakdown).mockReturnValue(
        mockBreakdown,
      )
    })

    it('updates all state including usage and cost', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any
      const usage = createUsage()

      const { logUsage, runUsage, logCost, runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      await streamManager.$updateStateFromResponse({
        response: { text: 'Hello' } as any,
        messages: [{ role: 'assistant', content: 'Hello' }] as any,
        tokenUsage: usage,
        provider: Providers.OpenAI,
        model: 'gpt-4',
        finishReason: 'stop',
      })

      streamManager.$endStream()

      await expect(logUsage).resolves.toEqual(usage)
      await expect(runUsage).resolves.toEqual(usage)
      const resolvedLogCost = await logCost
      const resolvedRunCost = await runCost
      expect(totalCost(resolvedLogCost)).toBeCloseTo(0.01)
      expect(totalCost(resolvedRunCost)).toBeCloseTo(0.01)
    })

    it('accumulates across multiple updateStateFromResponse calls', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any

      const { logUsage, runUsage, logCost, runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      await streamManager.$updateStateFromResponse({
        response: { text: 'Hello' } as any,
        messages: [{ role: 'assistant', content: 'Hello' }] as any,
        tokenUsage: createUsage(1),
        provider: Providers.OpenAI,
        model: 'gpt-4',
        finishReason: 'stop',
      })

      await streamManager.$updateStateFromResponse({
        response: { text: 'World' } as any,
        messages: [{ role: 'assistant', content: 'World' }] as any,
        tokenUsage: createUsage(2),
        provider: Providers.OpenAI,
        model: 'gpt-4',
        finishReason: 'stop',
      })

      streamManager.$endStream()

      const expectedUsage = {
        inputTokens: 300,
        outputTokens: 150,
        promptTokens: 300,
        completionTokens: 150,
        totalTokens: 450,
        reasoningTokens: 30,
        cachedInputTokens: 15,
      }

      await expect(logUsage).resolves.toEqual(expectedUsage)
      await expect(runUsage).resolves.toEqual(expectedUsage)
      const resolvedLogCost = await logCost
      const resolvedRunCost = await runCost
      expect(totalCost(resolvedLogCost)).toBeCloseTo(0.02)
      expect(totalCost(resolvedRunCost)).toBeCloseTo(0.02)
    })
  })

  describe('sub-agent aggregation', () => {
    const mockBreakdown: CostBreakdown = {
      'openai/gpt-4': {
        input: {
          prompt: { tokens: 100, cost: 0.003 },
          cached: { tokens: 0 },
        },
        output: {
          reasoning: { tokens: 0 },
          completion: { tokens: 50, cost: 0.007 },
        },
      },
    }

    beforeEach(() => {
      vi.mocked(estimateCostModule.estimateCostBreakdown).mockReturnValue(
        mockBreakdown,
      )
    })

    it('runCost includes both own cost and sub-agent costs', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any

      const subAgent1: CostBreakdown = {
        'anthropic/claude-sonnet-3-5': {
          input: {
            prompt: { tokens: 200, cost: 0.02 },
            cached: { tokens: 0 },
          },
          output: {
            reasoning: { tokens: 0 },
            completion: { tokens: 100, cost: 0.03 },
          },
        },
      }
      const subAgent2: CostBreakdown = {
        'anthropic/claude-sonnet-3-5': {
          input: {
            prompt: { tokens: 150, cost: 0.01 },
            cached: { tokens: 0 },
          },
          output: {
            reasoning: { tokens: 0 },
            completion: { tokens: 80, cost: 0.02 },
          },
        },
      }

      const { logCost, runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      await streamManager.$updateStateFromResponse({
        response: { text: 'Hello' } as any,
        messages: [{ role: 'assistant', content: 'Hello' }] as any,
        tokenUsage: createUsage(),
        provider: Providers.OpenAI,
        model: 'gpt-4',
        finishReason: 'stop',
      })

      streamManager.incrementRunCost(subAgent1)
      streamManager.incrementRunCost(subAgent2)

      streamManager.$endStream()

      const resolvedLogCost = await logCost
      expect(totalCost(resolvedLogCost)).toBeCloseTo(0.01)

      const resolvedRunCost = await runCost
      expect(totalCost(resolvedRunCost)).toBeCloseTo(0.09)
      expect(resolvedRunCost['openai/gpt-4']).toBeDefined()
      expect(resolvedRunCost['anthropic/claude-sonnet-3-5']).toBeDefined()
      expect(
        totalInputTokens(resolvedRunCost['anthropic/claude-sonnet-3-5']!),
      ).toBe(350)
    })

    it('runUsage includes both own usage and sub-agent usage', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any

      const { logUsage, runUsage } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      await streamManager.$updateStateFromResponse({
        response: { text: 'Hello' } as any,
        messages: [{ role: 'assistant', content: 'Hello' }] as any,
        tokenUsage: createUsage(1),
        provider: Providers.OpenAI,
        model: 'gpt-4',
        finishReason: 'stop',
      })

      streamManager.incrementRunUsage(createUsage(2))
      streamManager.incrementRunUsage(createUsage(3))

      streamManager.$endStream()

      await expect(logUsage).resolves.toEqual(createUsage(1))
      await expect(runUsage).resolves.toEqual({
        inputTokens: 600,
        outputTokens: 300,
        promptTokens: 600,
        completionTokens: 300,
        totalTokens: 900,
        reasoningTokens: 60,
        cachedInputTokens: 30,
      })
    })

    it('aggregates both tokens and costs from multiple sub-agents', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any

      const subAgent1: CostBreakdown = {
        'anthropic/claude-sonnet-3-5': {
          input: {
            prompt: { tokens: 200, cost: 0.008 },
            cached: { tokens: 0 },
          },
          output: {
            reasoning: { tokens: 0 },
            completion: { tokens: 100, cost: 0.012 },
          },
        },
      }
      const subAgent2: CostBreakdown = {
        'google/gemini-pro': {
          input: {
            prompt: { tokens: 100, cost: 0.004 },
            cached: { tokens: 0 },
          },
          output: {
            reasoning: { tokens: 0 },
            completion: { tokens: 50, cost: 0.006 },
          },
        },
      }

      const { logUsage, runUsage, logCost, runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      await streamManager.$updateStateFromResponse({
        response: { text: 'Main agent response' } as any,
        messages: [
          { role: 'assistant', content: 'Main agent response' },
        ] as any,
        tokenUsage: createUsage(1),
        provider: Providers.OpenAI,
        model: 'gpt-4',
        finishReason: 'stop',
      })

      streamManager.incrementRunUsage(createUsage(2))
      streamManager.incrementRunCost(subAgent1)

      streamManager.incrementRunUsage(createUsage(1))
      streamManager.incrementRunCost(subAgent2)

      streamManager.$endStream()

      await expect(logUsage).resolves.toEqual(createUsage(1))
      const resolvedLogCost = await logCost
      expect(totalCost(resolvedLogCost)).toBeCloseTo(0.01)

      await expect(runUsage).resolves.toEqual({
        inputTokens: 400,
        outputTokens: 200,
        promptTokens: 400,
        completionTokens: 200,
        totalTokens: 600,
        reasoningTokens: 40,
        cachedInputTokens: 20,
      })

      const resolvedRunCost = await runCost
      expect(totalCost(resolvedRunCost)).toBeCloseTo(0.04)
      expect(Object.keys(resolvedRunCost)).toHaveLength(3)
      expect(resolvedRunCost['openai/gpt-4']).toBeDefined()
      expect(resolvedRunCost['anthropic/claude-sonnet-3-5']).toBeDefined()
      expect(resolvedRunCost['google/gemini-pro']).toBeDefined()
    })
  })
})
