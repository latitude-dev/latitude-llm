import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@latitude-data/constants'
import { LegacyVercelSDKVersion4Usage as LanguageModelUsage } from '@latitude-data/constants/ai'
import { LogSources } from '../../constants'
import { incrementTokens, StreamManager, StreamManagerProps } from './index'
import * as estimateCostModule from '../../services/ai/estimateCost'

vi.spyOn(estimateCostModule, 'estimateCost')

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
    beforeEach(() => {
      vi.mocked(estimateCostModule.estimateCost).mockReturnValue(0.01)
    })

    it('incrementLogCost calculates cost using estimateCost', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any
      const usage = createUsage()

      const { logCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })
      streamManager.$incrementLogCost(usage)
      streamManager.$endStream()

      expect(estimateCostModule.estimateCost).toHaveBeenCalledWith({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage,
      })
      await expect(logCost).resolves.toBeCloseTo(0.01)
    })

    it('incrementLogCost does nothing without provider/model', async () => {
      const usage = createUsage()

      const { logCost } = streamManager.prepare()
      streamManager.$startStream()
      streamManager.$incrementLogCost(usage)
      streamManager.$endStream()

      expect(estimateCostModule.estimateCost).not.toHaveBeenCalled()
      await expect(logCost).resolves.toBe(0)
    })

    it('incrementRunCostFromUsage calculates cost using estimateCost', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any
      const usage = createUsage()

      const { runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })
      streamManager.$incrementRunCostFromUsage(usage)
      streamManager.$endStream()

      expect(estimateCostModule.estimateCost).toHaveBeenCalledWith({
        provider: Providers.OpenAI,
        model: 'gpt-4',
        usage,
      })
      await expect(runCost).resolves.toBeCloseTo(0.01)
    })

    it('incrementRunCost adds pre-computed cost directly', async () => {
      const { runCost } = streamManager.prepare()
      streamManager.$startStream()
      streamManager.incrementRunCost(0.05)
      streamManager.incrementRunCost(0.03)
      streamManager.$endStream()

      await expect(runCost).resolves.toBeCloseTo(0.08)
    })

    it('accumulates costs from multiple calls', async () => {
      vi.mocked(estimateCostModule.estimateCost).mockReturnValue(0.01)

      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any

      const { logCost, runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      streamManager.$incrementLogCost(createUsage())
      streamManager.$incrementLogCost(createUsage())

      streamManager.$incrementRunCostFromUsage(createUsage())
      streamManager.incrementRunCost(0.05)

      streamManager.$endStream()

      await expect(logCost).resolves.toBeCloseTo(0.02)
      await expect(runCost).resolves.toBeCloseTo(0.06)
    })
  })

  describe('updateStateFromResponse', () => {
    beforeEach(() => {
      vi.mocked(estimateCostModule.estimateCost).mockReturnValue(0.01)
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
        finishReason: 'stop',
      })

      streamManager.$endStream()

      await expect(logUsage).resolves.toEqual(usage)
      await expect(runUsage).resolves.toEqual(usage)
      await expect(logCost).resolves.toBeCloseTo(0.01)
      await expect(runCost).resolves.toBeCloseTo(0.01)
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
        finishReason: 'stop',
      })

      await streamManager.$updateStateFromResponse({
        response: { text: 'World' } as any,
        messages: [{ role: 'assistant', content: 'World' }] as any,
        tokenUsage: createUsage(2),
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
      await expect(logCost).resolves.toBeCloseTo(0.02)
      await expect(runCost).resolves.toBeCloseTo(0.02)
    })
  })

  describe('sub-agent aggregation', () => {
    beforeEach(() => {
      vi.mocked(estimateCostModule.estimateCost).mockReturnValue(0.01)
    })

    it('runCost includes both own cost and sub-agent costs', async () => {
      const provider = { provider: Providers.OpenAI } as any
      const config = { model: 'gpt-4' } as any

      const { logCost, runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      await streamManager.$updateStateFromResponse({
        response: { text: 'Hello' } as any,
        messages: [{ role: 'assistant', content: 'Hello' }] as any,
        tokenUsage: createUsage(),
        finishReason: 'stop',
      })

      streamManager.incrementRunCost(0.05)
      streamManager.incrementRunCost(0.03)

      streamManager.$endStream()

      await expect(logCost).resolves.toBeCloseTo(0.01)
      await expect(runCost).resolves.toBeCloseTo(0.09)
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

      const { logUsage, runUsage, logCost, runCost } = streamManager.prepare()
      streamManager.$startStream()
      await streamManager.$startProviderStep({ config, provider })

      await streamManager.$updateStateFromResponse({
        response: { text: 'Main agent response' } as any,
        messages: [
          { role: 'assistant', content: 'Main agent response' },
        ] as any,
        tokenUsage: createUsage(1),
        finishReason: 'stop',
      })

      streamManager.incrementRunUsage(createUsage(2))
      streamManager.incrementRunCost(0.02)

      streamManager.incrementRunUsage(createUsage(1))
      streamManager.incrementRunCost(0.01)

      streamManager.$endStream()

      await expect(logUsage).resolves.toEqual(createUsage(1))
      await expect(logCost).resolves.toBeCloseTo(0.01)

      await expect(runUsage).resolves.toEqual({
        inputTokens: 400,
        outputTokens: 200,
        promptTokens: 400,
        completionTokens: 200,
        totalTokens: 600,
        reasoningTokens: 40,
        cachedInputTokens: 20,
      })
      await expect(runCost).resolves.toBeCloseTo(0.04)
    })
  })
})
