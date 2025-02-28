import { createModelSpec } from './helpers'

// source: https://openai.com/api/pricing/
export const OPENAI_MODELS = createModelSpec({
  defaultModel: 'gpt-4o',
  models: {
    // gpt-4o mini family
    'gpt-4o-mini': { cost: { input: 0.15, output: 0.6 } },
    'gpt-4o-mini-audio-preview': {
      cost: { input: 0.15, output: 0.6 },
      hidden: true,
    },
    'gpt-4o-mini-realtime-preview': {
      cost: { input: 0.6, output: 2.4 },
      hidden: true,
    },

    // gpt-4 family
    'gpt-4o': { cost: { input: 2.5, output: 10.0 } },
    'gpt-4o-2024-05-13': { cost: { input: 5.0, output: 15.0 }, hidden: true },
    'gpt-4o-audio-preview': {
      cost: { input: 2.5, output: 10.0 },
      hidden: true,
    },
    'gpt-4o-realtime-preview': {
      cost: { input: 5.0, output: 20.0 },
      hidden: true,
    },

    // gpt-4.5 family
    'gpt-4.5-preview': { cost: { input: 75, output: 150 } },
    'gpt-4.5-preview-2025-02-27': {
      cost: { input: 75, output: 150 },
      hidden: true,
    },

    // o3 family
    'o3-mini': { cost: { input: 1.1, output: 4.4 } },

    // o1 family
    'o1-mini': { cost: { input: 1.1, output: 4.4 } },
    o1: { cost: { input: 15.0, output: 60.0 } },

    // Legacy models
    'o1-preview': { cost: { input: 15.0, output: 60.0 }, hidden: true },
    'chatgpt-4o-latest': { cost: { input: 5.0, output: 15.0 }, hidden: true },
    'gpt-4-turbo': { cost: { input: 10.0, output: 30.0 }, hidden: true },
    'gpt-4-turbo-2024-04-09': {
      cost: { input: 10.0, output: 30.0 },
      hidden: true,
    },
    'gpt-4': { cost: { input: 30.0, output: 60.0 }, hidden: true },
    'gpt-4-32k': { cost: { input: 60.0, output: 120.0 }, hidden: true },
    'gpt-4-0125-preview': { cost: { input: 10.0, output: 30.0 }, hidden: true },
    'gpt-4-1106-preview': { cost: { input: 10.0, output: 30.0 }, hidden: true },
    'gpt-4-vision-preview': {
      cost: { input: 10.0, output: 30.0 },
      hidden: true,
    },
    'gpt-3.5-turbo-0125': { cost: { input: 0.5, output: 1.5 }, hidden: true },
    'gpt-3.5-turbo-instruct': {
      cost: { input: 1.5, output: 2.0 },
      hidden: true,
    },
    'gpt-3.5-turbo-1106': { cost: { input: 1.0, output: 2.0 }, hidden: true },
    'gpt-3.5-turbo-0613': { cost: { input: 1.5, output: 2.0 }, hidden: true },
    'gpt-3.5-turbo-16k-0613': {
      cost: { input: 3.0, output: 4.0 },
      hidden: true,
    },
    'gpt-3.5-turbo-0301': { cost: { input: 1.5, output: 2.0 }, hidden: true },
    'davinci-002': { cost: { input: 2.0, output: 2.0 }, hidden: true },
    'babbage-002': { cost: { input: 0.4, output: 0.4 }, hidden: true },
  },
  modelName: (model: string) => {
    if (model.startsWith('gpt-4.5')) return 'gpt-4.5-preview'

    if (model.startsWith('o3-mini')) return 'o3-mini'

    if (model.startsWith('o1-preview')) return 'o1-preview'
    if (model.startsWith('o1-mini')) return 'o1-mini'
    if (model.startsWith('o1')) return 'o1'

    if (model.startsWith('gpt-4o-audio-preview')) return 'gpt-4o-audio-preview'
    if (model.startsWith('gpt-4o-realtime-preview')) {
      return 'gpt-4o-realtime-preview'
    }

    if (model.startsWith('gpt-4o-mini-audio-preview')) {
      return 'gpt-4o-mini-audio-preview'
    }
    if (model.startsWith('gpt-4o-mini-realtime-preview')) {
      return 'gpt-4o-mini-realtime-preview'
    }
    if (model.startsWith('gpt-4o-mini')) return 'gpt-4o-mini'

    if (model.startsWith('gpt-4o-')) return 'gpt-4o'

    if (model.startsWith('gpt-4-')) return 'gpt-4'
    if (model.startsWith('gpt-3.5-turbo-16k')) return 'gpt-3.5-turbo-16k-0613'
    if (model.startsWith('gpt-3.5-turbo')) return 'gpt-3.5-turbo-0613'
  },
})
