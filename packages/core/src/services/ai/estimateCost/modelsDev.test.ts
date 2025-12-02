import { describe, expect, it } from 'vitest'
import {
  findModelsDevModel,
  getModelsDevPricing,
  getBundledModelsDevData,
  getModelsDevForProvider,
  type ModelsDevModel,
} from './modelsDev'

const mockModels: ModelsDevModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4 Omni',
    provider: 'openai',
    pricing: {
      input: 2.5,
      output: 10.0,
    },
  },
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    pricing: {
      input: 5.0,
      output: 25.0,
    },
  },
  {
    id: 'model-without-pricing',
    name: 'Model Without Pricing',
    provider: 'unknown',
  },
]

describe('modelsDev', () => {
  describe('findModelsDevModel', () => {
    it('finds model by exact ID match', () => {
      const found = findModelsDevModel(mockModels, 'gpt-4o')
      expect(found).toEqual(mockModels[0])
    })

    it('finds model by case-insensitive ID match', () => {
      const found = findModelsDevModel(mockModels, 'GPT-4O')
      expect(found).toEqual(mockModels[0])
    })

    it('returns undefined if model not found', () => {
      const found = findModelsDevModel(mockModels, 'non-existent-model')
      expect(found).toBeUndefined()
    })
  })

  describe('getModelsDevPricing', () => {
    it('returns pricing if available', () => {
      const pricing = getModelsDevPricing(mockModels[0]!)
      expect(pricing).toEqual({
        input: 2.5,
        output: 10.0,
      })
    })

    it('returns null if pricing is missing', () => {
      const pricing = getModelsDevPricing(mockModels[2]!)
      expect(pricing).toBeNull()
    })

    it('returns null if input pricing is missing', () => {
      const model: ModelsDevModel = {
        id: 'test',
        name: 'Test',
        provider: 'test',
        pricing: {
          output: 10.0,
        },
      }
      const pricing = getModelsDevPricing(model)
      expect(pricing).toBeNull()
    })

    it('returns null if output pricing is missing', () => {
      const model: ModelsDevModel = {
        id: 'test',
        name: 'Test',
        provider: 'test',
        pricing: {
          input: 2.5,
        },
      }
      const pricing = getModelsDevPricing(model)
      expect(pricing).toBeNull()
    })
  })

  describe('getBundledModelsDevData', () => {
    it('returns bundled data', () => {
      const data = getBundledModelsDevData()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })
  })

  describe('getModelsDevForProvider', () => {
    it('returns models for a specific provider', () => {
      const openaiModels = getModelsDevForProvider('openai')
      expect(Array.isArray(openaiModels)).toBe(true)
      expect(openaiModels.length).toBeGreaterThan(0)
      expect(
        openaiModels.every((m) => m.provider.toLowerCase() === 'openai'),
      ).toBe(true)
    })

    it('handles case-insensitive provider names', () => {
      const models1 = getModelsDevForProvider('openai')
      const models2 = getModelsDevForProvider('OpenAI')
      expect(models1).toEqual(models2)
    })

    it('returns empty array for unknown provider', () => {
      const models = getModelsDevForProvider('unknown-provider-xyz')
      expect(models).toEqual([])
    })
  })
})
