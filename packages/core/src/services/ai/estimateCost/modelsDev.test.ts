import { describe, expect, it } from 'vitest'
import {
  findModelsDevModel,
  findModelsDevModelWithFallback,
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
    id: 'gpt-4.1',
    name: 'GPT-4.1',
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

  describe('findModelsDevModelWithFallback', () => {
    it('finds model by exact ID first', () => {
      const found = findModelsDevModelWithFallback(mockModels, 'gpt-4.1')
      expect(found?.id).toBe('gpt-4.1')
    })

    it('falls back to longest prefix match (e.g. gpt-4.1-2025-04-14 or my-model-preview)', () => {
      expect(
        findModelsDevModelWithFallback(mockModels, 'gpt-4.1-2025-04-14')?.id,
      ).toBe('gpt-4.1')
      expect(
        findModelsDevModelWithFallback(mockModels, 'gpt-4o-mini-preview')?.id,
      ).toBe('gpt-4o')
    })

    it('does not match when requested is shorter than DB ids (e.g. "gpt" must not match "gpt-4" or "gpt-4.1")', () => {
      const modelsWithGpt: ModelsDevModel[] = [
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
        { id: 'gpt-5', name: 'GPT-5', provider: 'openai' },
      ]
      expect(
        findModelsDevModelWithFallback(modelsWithGpt, 'gpt'),
      ).toBeUndefined()
      expect(findModelsDevModelWithFallback(mockModels, 'gpt')).toBeUndefined()
    })

    it('picks longest matching prefix when several match', () => {
      const modelsWithPrefix: ModelsDevModel[] = [
        { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai' },
      ]
      const found = findModelsDevModelWithFallback(
        modelsWithPrefix,
        'gpt-4.1-mini-preview',
      )
      expect(found?.id).toBe('gpt-4.1-mini')
    })

    it('returns undefined when no exact nor prefix match', () => {
      const found = findModelsDevModelWithFallback(
        mockModels,
        'gpt-5-2026-01-01',
      )
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
      const modelWithoutPricing = mockModels.find(
        (m) => m.id === 'model-without-pricing',
      )!
      const pricing = getModelsDevPricing(modelWithoutPricing)
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
