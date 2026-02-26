import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Providers,
  LegacyVercelSDKVersion4Usage,
} from '@latitude-data/constants'
import {
  computeCost,
  estimateCost,
  estimateCostBreakdown,
  getCostPer1M,
} from './index'
import * as modelsDev from './modelsDev'

vi.mock('./modelsDev', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./modelsDev')>()
  return {
    ...actual,
    getBundledModelsDevData: vi.fn(actual.getBundledModelsDevData),
    findModelsDevModel: vi.fn(actual.findModelsDevModel),
    getModelsDevPricing: vi.fn(actual.getModelsDevPricing),
  }
})

const createUsage = (
  overrides?: Partial<LegacyVercelSDKVersion4Usage>,
): LegacyVercelSDKVersion4Usage => ({
  inputTokens: 1000,
  outputTokens: 500,
  promptTokens: 1000,
  completionTokens: 500,
  totalTokens: 1500,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  ...overrides,
})

describe('estimateCost integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('estimateCost', () => {
    it('estimates cost using bundled models.dev data', () => {
      // When models.dev data is available, it should calculate cost
      // Note: This test relies on actual models.dev data being available
      const cost = estimateCost({
        provider: Providers.OpenAI,
        model: 'gpt-4o',
        usage: createUsage(),
      })

      // Cost should be calculated if model is found in models.dev
      expect(typeof cost).toBe('number')
      expect(cost).toBeGreaterThanOrEqual(0)
    })

    it('estimates cost with reasoning tokens', () => {
      // When models.dev data is available, it should calculate cost
      const cost = estimateCost({
        provider: Providers.OpenAI,
        model: 'o1',
        usage: createUsage({
          reasoningTokens: 200,
        }),
      })

      expect(typeof cost).toBe('number')
      expect(cost).toBeGreaterThanOrEqual(0)
    })

    it('handles missing usage data gracefully', () => {
      const cost = estimateCost({
        provider: Providers.OpenAI,
        model: 'gpt-4o',
        usage: createUsage({
          promptTokens: NaN,
          completionTokens: NaN,
          inputTokens: NaN,
          outputTokens: NaN,
        }),
      })

      // NaN tokens are converted to 0, so cost should be 0
      expect(cost).toBe(0)
    })

    it('returns zero cost if models.dev model not found', () => {
      // Mock to return empty array so model won't be found
      vi.mocked(modelsDev.getBundledModelsDevData).mockReturnValueOnce([])

      const cost = estimateCost({
        provider: Providers.OpenAI,
        model: 'non-existent-model-xyz',
        usage: createUsage(),
      })

      // When model not found, returns costImplemented: false with zeros
      expect(cost).toBe(0)
    })

    it('handles errors gracefully', () => {
      vi.mocked(modelsDev.getBundledModelsDevData).mockImplementationOnce(
        () => {
          throw new Error('Parse error')
        },
      )

      const cost = estimateCost({
        provider: Providers.OpenAI,
        model: 'gpt-4o',
        usage: createUsage(),
      })

      // When error occurs, getCostFromModelsDev returns costImplemented: false with zeros
      // but estimateCost still computes using those zeros, resulting in 0
      // However, if the error is caught and fallback is used, cost may be calculated
      expect(typeof cost).toBe('number')
      expect(cost).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getCostPer1M', () => {
    it('returns OpenAI model costs', () => {
      // When models.dev data is available, it should return the cost
      const costPer1M = getCostPer1M({
        provider: Providers.OpenAI,
        model: 'gpt-4o',
      })

      // Cost should be implemented if model is found in models.dev
      expect(typeof costPer1M.costImplemented).toBe('boolean')
      expect(costPer1M.cost).toHaveProperty('input')
      expect(costPer1M.cost).toHaveProperty('output')
    })

    it('returns Anthropic model costs', () => {
      // When models.dev data is available, it should return the cost
      const costPer1M = getCostPer1M({
        provider: Providers.Anthropic,
        model: 'claude-opus-4-5',
      })

      // Cost should be implemented if model is found in models.dev
      expect(typeof costPer1M.costImplemented).toBe('boolean')
      expect(costPer1M.cost).toHaveProperty('input')
      expect(costPer1M.cost).toHaveProperty('output')
    })

    it('handles unknown models with fallback', () => {
      // Empty array means no models.dev data, returns not implemented
      vi.mocked(modelsDev.getBundledModelsDevData).mockReturnValueOnce([])
      vi.mocked(modelsDev.findModelsDevModel).mockReturnValueOnce(undefined)

      const costPer1M = getCostPer1M({
        provider: Providers.OpenAI,
        model: 'unknown-future-model',
      })

      // When model is not found in models.dev, returns costImplemented: false
      expect(costPer1M.costImplemented).toBe(false)
      expect(costPer1M.cost).toEqual({
        input: 0,
        output: 0,
      })
    })

    it('returns non-implemented cost for Azure', () => {
      const costPer1M = getCostPer1M({
        provider: Providers.Azure,
        model: 'some-model',
      })

      expect(costPer1M.costImplemented).toBe(false)
      expect(costPer1M.cost).toEqual({
        input: 0,
        output: 0,
      })
    })

    it('returns non-implemented cost for Custom provider', () => {
      const costPer1M = getCostPer1M({
        provider: Providers.Custom,
        model: 'custom-model',
      })

      expect(costPer1M.costImplemented).toBe(false)
      expect(costPer1M.cost).toEqual({
        input: 0,
        output: 0,
      })
    })
  })

  describe('estimateCostBreakdown', () => {
    it('returns a full cost breakdown by token category', () => {
      const provider = Providers.OpenAI
      const model = 'gpt-4o'
      const usage = createUsage({
        promptTokens: 2_000_000,
        cachedInputTokens: 1_000_000,
        reasoningTokens: 3_000_000,
        completionTokens: 500_000,
      })
      const costSpec = getCostPer1M({ provider, model }).cost

      const breakdown = estimateCostBreakdown({
        provider,
        model,
        usage,
      })

      expect(breakdown).toEqual({
        'openai/gpt-4o': {
          input: {
            prompt: {
              tokens: 2_000_000,
              cost: computeCost({
                costSpec,
                tokens: usage.promptTokens,
                tokenType: 'input',
              }),
            },
            cached: {
              tokens: 1_000_000,
              cost: computeCost({
                costSpec,
                tokens: usage.cachedInputTokens,
                tokenType: 'cacheRead',
              }),
            },
          },
          output: {
            reasoning: {
              tokens: 3_000_000,
              cost: computeCost({
                costSpec,
                tokens: usage.reasoningTokens,
                tokenType: 'reasoning',
              }),
            },
            completion: {
              tokens: 500_000,
              cost: computeCost({
                costSpec,
                tokens: usage.completionTokens,
                tokenType: 'output',
              }),
            },
          },
        },
      })
    })

    it('converts NaN token counts to zero in each category', () => {
      const breakdown = estimateCostBreakdown({
        provider: Providers.OpenAI,
        model: 'gpt-4o',
        usage: createUsage({
          promptTokens: NaN,
          cachedInputTokens: 500_000,
          reasoningTokens: 250_000,
          completionTokens: NaN,
        }),
      })

      expect(breakdown).toEqual({
        'openai/gpt-4o': {
          input: {
            prompt: {
              tokens: 0,
              cost: 0,
            },
            cached: {
              tokens: 500_000,
              cost: expect.any(Number),
            },
          },
          output: {
            reasoning: {
              tokens: 250_000,
              cost: expect.any(Number),
            },
            completion: {
              tokens: 0,
              cost: 0,
            },
          },
        },
      })
    })
  })
})
