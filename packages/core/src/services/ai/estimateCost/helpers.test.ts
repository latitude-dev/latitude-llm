import { beforeAll, describe, expect, it } from 'vitest'
import { type ModelSpecReturn, createModelSpec } from './helpers'

let modelSpec: ModelSpecReturn
describe('createModelSpec', () => {
  beforeAll(() => {
    modelSpec = createModelSpec({
      defaultModel: 'model-a',
      models: {
        'model-a': { cost: { input: 0.1, output: 0.2 } },
        'model-b': { cost: { input: 0.2, output: 0.3 } },
        'hidden-model': { cost: { input: 0.3, output: 0.4 }, hidden: true },
        'range-model': {
          cost: [
            { input: 3, output: 3, tokensRangeStart: 4000 },
            { input: 0.75, output: 0.99 },
            { input: 5, output: 5, tokensRangeStart: 32000 },
          ],
        },
      },
      modelName: (model: string) => {
        if (model.startsWith('model-a')) return 'model-a'
        if (model.startsWith('model-b')) return 'model-b'
        return undefined
      },
    })
  })

  it('creates a model spec', () => {
    expect(modelSpec).toEqual({
      getCost: expect.any(Function),
      modelList: {
        'hidden-model': 'hidden-model',
        'model-a': 'model-a',
        'model-b': 'model-b',
        'range-model': 'range-model',
      },
      modelSpec: {
        'hidden-model': {
          cost: {
            input: 0.3,
            output: 0.4,
          },
          hidden: true,
          name: 'hidden-model',
        },
        'model-a': {
          cost: {
            input: 0.1,
            output: 0.2,
          },
          name: 'model-a',
        },
        'model-b': {
          cost: {
            input: 0.2,
            output: 0.3,
          },
          name: 'model-b',
        },
        'range-model': {
          name: 'range-model',
          cost: [
            { input: 0.75, output: 0.99 },
            { input: 3, output: 3, tokensRangeStart: 4000 },
            { input: 5, output: 5, tokensRangeStart: 32000 },
          ],
        },
      },
      uiList: {
        'model-a': 'model-a',
        'model-b': 'model-b',
        'range-model': 'range-model',
      },
    })
  })

  it('should return correct cost for exact match', () => {
    expect(modelSpec.getCost('model-a')).toEqual({
      cost: {
        input: 0.1,
        output: 0.2,
      },
      costImplemented: true,
    })
    expect(modelSpec.getCost('model-b')).toEqual({
      cost: {
        input: 0.2,
        output: 0.3,
      },
      costImplemented: true,
    })
  })

  it('should return correct cost for range match', () => {
    expect(modelSpec.getCost('range-model')).toEqual({
      cost: [
        { input: 0.75, output: 0.99 },
        { input: 3, output: 3, tokensRangeStart: 4000 },
        { input: 5, output: 5, tokensRangeStart: 32000 },
      ],
      costImplemented: true,
    })
  })

  it('should return correct cost for fallback match', () => {
    expect(modelSpec.getCost('model-a-variant')).toEqual({
      cost: {
        input: 0.1,
        output: 0.2,
      },
      costImplemented: true,
    })
    expect(modelSpec.getCost('model-b-extra')).toEqual({
      cost: {
        input: 0.2,
        output: 0.3,
      },
      costImplemented: true,
    })
  })

  it('returns defaultModel when model is uknown', () => {
    expect(modelSpec.getCost('unknown-model')).toEqual({
      cost: {
        input: 0.1,
        output: 0.2,
      },
      costImplemented: true,
    })
  })
})
