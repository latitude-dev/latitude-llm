import { Providers } from '@latitude-data/constants'
import { describe, expect, it } from 'vitest'
import { estimateCost } from './index'

describe('estimateCost', () => {
  it('calculates cost for a single cost model', () => {
    const usage = {
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      totalTokens: 1_500_000,
    }
    const cost = estimateCost({
      usage,
      provider: Providers.Google,
      model: 'gemini-1.0-pro',
    })

    // Expected cost:
    // - Input: (0.5 * 1,000,000) / 1,000,000 = 0.5
    // - Output: (1.5 * 500,000) / 1,000,000 = 0.75
    // Total = 0.5 + 0.75 = 1.25
    expect(cost).toBeCloseTo(1.25)
  })

  it('calculates cost for a tiered model (below threshold)', () => {
    const usage = {
      promptTokens: 100_000,
      completionTokens: 50_000,
      totalTokens: 150_000,
    }
    const cost = estimateCost({
      usage,
      provider: Providers.Google,
      model: 'gemini-1.5-flash',
    })

    // For tiered-model-flash:
    // Both input and output tokens are below the threshold (128,000), so the first tier applies:
    // Input: (0.075 * 100,000) / 1,000,000 = 0.0075
    // Output: (0.3 * 50,000) / 1,000,000 = 0.015
    // Total = 0.0075 + 0.015 = 0.0225
    expect(cost).toBeCloseTo(0.0225)
  })

  it('calculates cost for a tiered model (above threshold)', () => {
    const usage = {
      promptTokens: 200_000,
      completionTokens: 300_000,
      totalTokens: 500_000,
    }
    const cost = estimateCost({
      usage,
      provider: Providers.Google,
      model: 'gemini-1.5-pro',
    })

    // For tiered-model-pro:
    // Input tokens:
    //   - First 128,000 tokens at 1.25: (1.25 * 128,000) / 1,000,000 = 0.16
    //   - Remaining 72,000 tokens at 2.5: (2.5 * 72,000) / 1,000,000 = 0.18
    //   Total input cost = 0.16 + 0.18 = 0.34
    //
    // Output tokens:
    //   - First 128,000 tokens at 5: (5 * 128,000) / 1,000,000 = 0.64
    //   - Remaining 172,000 tokens at 10: (10 * 172,000) / 1,000,000 = 1.72
    //   Total output cost = 0.64 + 1.72 = 2.36
    //
    // Overall cost = 0.34 + 2.36 = 2.70
    expect(cost).toBeCloseTo(2.7)
  })

  it('handles NaN tokens as 0', () => {
    const usage = { promptTokens: NaN, completionTokens: NaN, totalTokens: NaN }
    const cost = estimateCost({
      usage,
      provider: Providers.Google,
      model: 'gemini-1.0-pro',
    })

    expect(cost).toEqual(0)
  })
})
