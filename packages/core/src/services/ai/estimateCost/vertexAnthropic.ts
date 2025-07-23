import { createModelSpec } from './helpers'

// https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models
export const VERTEX_ANTHROPIC_MODELS = createModelSpec({
  defaultModel: 'claude-sonnet-4@20250514',
  models: {
    // Claude 4 Models
    'claude-sonnet-4@20250514': { cost: { input: 3.0, output: 15.0 } },
    'claude-opus-4@20250514': { cost: { input: 15.0, output: 75.0 } },

    // Claude 3.7 Models
    'claude-3-7-sonnet@20250219': { cost: { input: 3.0, output: 15.0 } },

    // Claude 3.5 Models
    'claude-3-5-sonnet-v2@20241022': { cost: { input: 3.0, output: 15.0 } },
    'claude-3-5-sonnet@20240620': { cost: { input: 3.0, output: 15.0 } },
    'claude-3-5-haiku@20241022': { cost: { input: 0.8, output: 4.0 } },

    // Claude 3 Models
    'claude-3-opus@20240229': { cost: { input: 15.0, output: 75.0 } },
    'claude-3-haiku@20240307': { cost: { input: 0.25, output: 1.25 } },
  },
  modelName: (model: string) => {
    if (model.startsWith('claude-sonnet-4')) {
      return 'claude-sonnet-4@20250514'
    }

    if (model.startsWith('claude-opus-4')) {
      return 'claude-opus-4@20250514'
    }

    if (model.startsWith('claude-3-7-sonnet')) {
      return 'claude-3-7-sonnet@20250219'
    }

    if (model.startsWith('claude-3-5-sonnet-v2')) {
      return 'claude-3-5-sonnet-v2@20241022'
    }

    if (model.startsWith('claude-3-5-sonnet')) {
      return 'claude-3-5-sonnet@20240620'
    }

    if (model.startsWith('claude-3-5-haiku')) {
      return 'claude-3-5-haiku@20241022'
    }

    if (model.startsWith('claude-3-opus')) {
      return 'claude-3-opus@20240229'
    }

    if (model.startsWith('claude-3-haiku')) {
      return 'claude-3-haiku@20240307'
    }
  },
})
