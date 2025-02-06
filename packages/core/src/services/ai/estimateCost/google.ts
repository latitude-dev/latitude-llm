import { createModelSpec } from './helpers'

// https://ai.google.dev/pricing
// Also for getting the full list of models
// https://generativelanguage.googleapis.com/v1beta/models/?key=[YOUR_GEMINI_KEY]

export const GOOGLE_MODELS = createModelSpec({
  defaultModel: 'gemini-1.5-flash',
  models: {
    'gemini-2.0-flash': { cost: { input: 0.1, output: 0.4 } },
    'gemini-2.0-flash-exp': { cost: { input: 0, output: 0 } },
    'gemini-2.0-flash-lite': { cost: { input: 0, output: 0 } },
    'gemini-2.0-pro-exp': { cost: { input: 0, output: 0 } },
    'gemini-2.0-flash-thinking-exp': { cost: { input: 0, output: 0 } },

    'gemini-1.5-pro': {
      cost: [
        { input: 1.25, output: 5 },
        { input: 2.5, output: 10, tokensRangeStart: 128_000 },
      ],
    },
    'gemini-1.5-flash': {
      cost: [
        { input: 0.075, output: 0.3 },
        { input: 0.15, output: 0.6, tokensRangeStart: 128_000 },
      ],
    },
    'gemini-1.5-flash-8b': {
      cost: [
        { input: 0.0375, output: 0.15 },
        { input: 0.075, output: 0.3, tokensRangeStart: 128_000 },
      ],
    },

    'gemini-1.0-pro': { cost: { input: 0.5, output: 1.5 } },
    'gemini-1.0-pro-001': { cost: { input: 0.5, output: 1.5 } },

    'gemini-1.0-pro-vision-latest': { cost: { input: 0.5, output: 1.5 } },
    'gemini-pro-vision': { cost: { input: 0.5, output: 1.5 } },
  },
  modelName: (model: string) => {
    if (model.startsWith('gemini-2.0-flash-thinking-exp')) {
      return 'gemini-2.0-flash-thinking-exp'
    }
    if (model.startsWith('gemini-2.0-pro-exp')) return 'gemini-2.0-pro-exp'
    if (model.startsWith('gemini-2.0-flash-lite-'))
      return 'gemini-2.0-flash-lite'
    if (model.startsWith('gemini-2.0-flash-')) return 'gemini-2.0-flash'

    if (model.startsWith('gemini-1.5-pro-')) return 'gemini-1.5-pro'
    if (model.startsWith('gemini-1.0-flash-8b-')) return 'gemini-1.5-flash-8b'
    if (model.startsWith('gemini-1.5-flash-')) return 'gemini-1.5-flash'
    if (model.startsWith('gemini-1.0-pro-')) return 'gemini-1.0-pro'
  },
})
