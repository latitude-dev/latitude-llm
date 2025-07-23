import { createModelSpec } from './helpers'

// source: https://openai.com/api/pricing/
// NOTE: Order matters here, the first model is the default model
export const OPENAI_MODELS = createModelSpec({
  defaultModel: 'gpt-4.1-mini',
  models: {
    // gpt-4o mini family
    'gpt-4o-mini': { cost: { input: 0.15, output: 0.6 } },
    'gpt-4o-mini-2024-07-18': {
      cost: { input: 0.15, output: 0.6 },
      hidden: true,
    },
    'gpt-4o-mini-audio-preview': {
      cost: { input: 0.15, output: 0.6 },
      hidden: true,
    },
    'gpt-4o-mini-audio-preview-2024-12-17': {
      cost: { input: 0.15, output: 0.6 },
      hidden: true,
    },
    'gpt-4o-mini-realtime-preview': {
      cost: { input: 0.6, output: 2.4 },
      hidden: true,
    },
    'gpt-4o-mini-realtime-preview-2024-12-17': {
      cost: { input: 0.6, output: 2.4 },
      hidden: true,
    },
    'gpt-4o-mini-search-preview': {
      cost: { input: 0.15, output: 0.6 },
      hidden: true,
    },
    'gpt-4o-mini-search-preview-2025-03-11': {
      cost: { input: 0.15, output: 0.6 },
      hidden: true,
    },

    // gpt-4.1 family
    'gpt-4.1': { cost: { input: 2.0, output: 8.0 } },
    'gpt-4.1-2025-04-14': { cost: { input: 2.0, output: 8.0 }, hidden: true },
    'gpt-4.1-mini': { cost: { input: 0.4, output: 1.6 } },
    'gpt-4.1-mini-2025-04-14': {
      cost: { input: 0.4, output: 1.6 },
      hidden: true,
    },
    'gpt-4.1-nano': { cost: { input: 0.1, output: 0.4 } },
    'gpt-4.1-nano-2025-04-14': {
      cost: { input: 0.1, output: 0.4 },
      hidden: true,
    },

    // gpt-4.5 family
    'gpt-4.5-preview': { cost: { input: 75.0, output: 150.0 } },
    'gpt-4.5-preview-2025-02-27': {
      cost: { input: 75.0, output: 150.0 },
      hidden: true,
    },

    // gpt-4o family
    'gpt-4o': { cost: { input: 2.5, output: 10.0 } },
    'gpt-4o-2024-08-06': { cost: { input: 2.5, output: 10.0 }, hidden: true },
    'gpt-4o-audio-preview': {
      cost: { input: 2.5, output: 10.0 },
      hidden: true,
    },
    'gpt-4o-audio-preview-2024-12-17': {
      cost: { input: 2.5, output: 10.0 },
      hidden: true,
    },
    'gpt-4o-realtime-preview': {
      cost: { input: 5.0, output: 20.0 },
      hidden: true,
    },
    'gpt-4o-realtime-preview-2024-12-17': {
      cost: { input: 5.0, output: 20.0 },
      hidden: true,
    },
    'gpt-4o-search-preview': {
      cost: { input: 2.5, output: 10.0 },
      hidden: true,
    },
    'gpt-4o-search-preview-2025-03-11': {
      cost: { input: 2.5, output: 10.0 },
      hidden: true,
    },

    // o1 family
    o1: { cost: { input: 15.0, output: 60.0 } },
    'o1-2024-12-17': { cost: { input: 15.0, output: 60.0 }, hidden: true },
    'o1-pro': { cost: { input: 150.0, output: 600.0 } },
    'o1-pro-2025-03-19': {
      cost: { input: 150.0, output: 600.0 },
      hidden: true,
    },
    'o1-mini': { cost: { input: 1.1, output: 4.4 } },
    'o1-mini-2024-09-12': { cost: { input: 1.1, output: 4.4 }, hidden: true },

    // o3 family
    o3: { cost: { input: 10.0, output: 40.0 } },
    'o3-2025-04-16': { cost: { input: 10.0, output: 40.0 }, hidden: true },
    'o3-mini': { cost: { input: 1.1, output: 4.4 } },
    'o3-mini-2025-01-31': { cost: { input: 1.1, output: 4.4 }, hidden: true },

    // o4 family
    'o4-mini': { cost: { input: 1.1, output: 4.4 } },
    'o4-mini-2025-04-16': { cost: { input: 1.1, output: 4.4 }, hidden: true },

    // computer-use family
    'computer-use-preview': {
      cost: { input: 3.0, output: 12.0 },
      hidden: true,
    },
    'computer-use-preview-2025-03-11': {
      cost: { input: 3.0, output: 12.0 },
      hidden: true,
    },
  },
  modelName: (model: string) => {
    if (model.startsWith('gpt-4.5')) return 'gpt-4.5-preview'
    if (model.startsWith('gpt-4.1-nano')) return 'gpt-4.1-nano'
    if (model.startsWith('gpt-4.1-mini')) return 'gpt-4.1-mini'
    if (model.startsWith('gpt-4.1')) return 'gpt-4.1'

    if (model.startsWith('o4-mini')) return 'o4-mini'
    if (model.startsWith('o3-mini')) return 'o3-mini'
    if (model.startsWith('o3')) return 'o3'

    if (model.startsWith('o1-mini')) return 'o1-mini'
    if (model.startsWith('o1-pro')) return 'o1-pro'
    if (model.startsWith('o1')) return 'o1'

    if (model.startsWith('gpt-4o-mini-search-preview'))
      return 'gpt-4o-mini-search-preview'
    if (model.startsWith('gpt-4o-mini-audio-preview'))
      return 'gpt-4o-mini-audio-preview'
    if (model.startsWith('gpt-4o-mini-realtime-preview'))
      return 'gpt-4o-mini-realtime-preview'
    if (model.startsWith('gpt-4o-mini')) return 'gpt-4o-mini'

    if (model.startsWith('gpt-4o-search-preview'))
      return 'gpt-4o-search-preview'
    if (model.startsWith('gpt-4o-audio-preview')) return 'gpt-4o-audio-preview'
    if (model.startsWith('gpt-4o-realtime-preview'))
      return 'gpt-4o-realtime-preview'
    if (model.startsWith('gpt-4o')) return 'gpt-4o'

    if (model.startsWith('computer-use-preview')) return 'computer-use-preview'
  },
})
