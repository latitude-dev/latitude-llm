import { createModelSpec } from './helpers'

// source: https://docs.anthropic.com/en/docs/about-claude/models
export const ANTHROPIC_MODELS = createModelSpec({
  defaultModel: 'claude-3-5-sonnet-20241022',
  models: {
    'claude-3-7-sonnet-latest': { cost: { input: 3.0, output: 15.0 } },
    'claude-3-7-sonnet-20250219': {
      cost: { input: 3.0, output: 15.0 },
      hidden: true,
    },

    'claude-3-5-sonnet-latest': { cost: { input: 3.0, output: 15.0 } },
    'claude-3-5-sonnet-20241022': {
      cost: { input: 3.0, output: 15.0, hidden: true },
    },
    'claude-3-5-sonnet-20240620': {
      cost: { input: 3.0, output: 15.0, hidden: true },
    },

    'claude-3-sonnet-latest': { cost: { input: 3.0, output: 15.0 } },
    'claude-3-sonnet-20240229': {
      cost: { input: 3.0, output: 15.0, hidden: true },
    },

    'claude-3-opus-latest': { cost: { input: 15.0, output: 75.0 } },
    'claude-3-opus-20240229': {
      cost: { input: 15.0, output: 75.0, hidden: true },
    },

    'claude-3-5-haiku-latest': { cost: { input: 0.8, output: 4.0 } },
    'claude-3-5-haiku-20241022': {
      cost: { input: 0.8, output: 4.0, hidden: true },
    },

    'claude-3-haiku-latest': { cost: { input: 0.25, output: 1.25 } },
    'claude-3-haiku-20240307': {
      cost: { input: 0.25, output: 1.25, hidden: true },
    },

    // Old models
    'claude-2.1': { cost: { input: 8.0, output: 24.0 }, hidden: true },
    'claude-2.0': { cost: { input: 8.0, output: 24.0 }, hiden: true },
    'claude-instant-1.2': { cost: { input: 0.8, output: 2.4 }, hidden: true },
  },
  modelName: (model: string) => {
    if (model.startsWith('claude-3-7-sonnet')) {
      return 'claude-3-7-sonnet-latest'
    }

    if (model.startsWith('claude-3-5-sonnet')) {
      return 'claude-3-5-sonnet-latest'
    }
    if (model.startsWith('claude-3-opus')) return 'claude-3-opus-latest'
    if (model.startsWith('claude-3-sonnet')) return 'claude-3-sonnet-latest'
    if (model.startsWith('claude-3-haiku')) return 'claude-3-haiku-latest'
  },
})
