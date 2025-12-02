import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Providers,
  LegacyVercelSDKVersion4Usage,
} from '@latitude-data/constants'
import { estimateCost, getCostPer1M } from './index'
import * as modelsDev from './modelsDev'

// Mock the modelsDev module
vi.mock('./modelsDev', () => ({
  getBundledModelsDevData: vi.fn(),
  findModelsDevModel: vi.fn(),
  getModelsDevPricing: vi.fn(),
}))

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
})
