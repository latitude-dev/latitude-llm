import { createModelSpec } from './helpers'

// source: https://mistral.ai/en/products/la-plateforme#pricing
export const MISTRAL_MODELS = createModelSpec({
  defaultModel: 'mistral-small-latest',
  models: {
    'mistral-large-latest': { cost: { input: 2.0, output: 6.0 } },
    'mistral-small-latest': { cost: { input: 0.1, output: 0.3 } },
    'mistral-small-3.1': { cost: { input: 0.1, output: 0.3 } },

    // Code capable models
    'devstral-medium': { cost: { input: 0.4, output: 2.0 } },
    'codestral-latest': { cost: { input: 0.3, output: 0.9 } },

    // Vision capable model
    'pixtral-large-latest': { cost: { input: 2.0, output: 6.0 } },

    'ministral-8b-latest': { cost: { input: 0.1, output: 0.1 } },
    'ministral-3b-latest': { cost: { input: 0.04, output: 0.04 } },
    'mistral-embed': { cost: { input: 0.1, output: 0.1 } },
    'mistral-moderation-latest': { cost: { input: 0.1, output: 0.1 } },
    'pixtral-12b': { cost: { input: 0.15, output: 0.15 } },
    'mistral-nemo': { cost: { input: 0.15, output: 0.15 } },
    'open-mistral-7b': { cost: { input: 0.25, output: 0.25 } },
    'open-mixtral-8x7b': { cost: { input: 0.7, output: 0.7 } },
    'open-mixtral-8x22b': { cost: { input: 2.0, output: 6.0 } },

    // Legacy models hidden in UI
    'codestral-2405': { cost: { input: 1.0, output: 3.0 }, hidden: true },
    'open-mistral-nemo-2407': {
      cost: { input: 0.3, output: 0.3 },
      hidden: true,
    },
    'mistral-large-2407': { cost: { input: 3.0, output: 9.0 }, hidden: true },
    'mistral-medium-latest': {
      cost: { input: 2.75, output: 8.1 },
      hidden: true,
    },
  },
  modelName: (model: string) => {
    if (model.startsWith('mistral-small-3.1')) return 'mistral-small-3.1'
    if (model.startsWith('mistral-small')) return 'mistral-small-latest'
    if (model.startsWith('mistral-large')) return 'mistral-large-latest'
    if (model.startsWith('mistral-medium')) return 'mistral-medium-latest'

    if (model.startsWith('devstral-medium')) return 'devstral-medium'
    if (model.startsWith('codestral')) return 'codestral-latest'

    if (model.startsWith('open-mistral')) return 'open-mistral-7b'
    if (model.startsWith('open-mixtral-8x7b')) return 'open-mixtral-8x7b'
    if (model.startsWith('open-mixtral-8x22b')) return 'open-mixtral-8x22b'
    if (model.startsWith('open-mixtral')) return 'open-mixtral-8x7b'

    if (model.startsWith('open-mistral-nemo')) return 'open-mistral-nemo-2407'
  },
})
