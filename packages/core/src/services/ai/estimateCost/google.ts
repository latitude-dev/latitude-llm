import { createModelSpec } from './helpers'

// https://ai.google.dev/pricing
// Also for getting the full list of models
// https://generativelanguage.googleapis.com/v1beta/models/?key=[YOUR_GEMINI_KEY]

export const GOOGLE_MODELS = createModelSpec({
  defaultModel: 'gemini-1.5-flash',
  models: {
    'gemini-2.5-pro': {
      // Note: Pricing includes thinking tokens
      cost: [
        { input: 1.25, output: 10.0 },
        { input: 2.5, output: 15.0, tokensRangeStart: 200_000 },
      ],
    },
    'gemini-2.5-pro-preview-05-06': {
      // Note: Pricing includes thinking tokens
      cost: [
        { input: 1.25, output: 10.0 },
        { input: 2.5, output: 15.0, tokensRangeStart: 200_000 },
      ],
    },
    // --- Gemini 2.5 Preview Models ---
    'gemini-2.5-pro-preview-03-25': {
      // Note: Pricing includes thinking tokens
      cost: [
        { input: 1.25, output: 10.0 },
        { input: 2.5, output: 15.0, tokensRangeStart: 200_000 },
      ],
    },
    'gemini-2.5-flash-lite-preview-06-17': {
      // Note: Using non-thinking output cost
      cost: { input: 0.1, output: 0.4 }, // Input assumes text/image/video cost
    },
    'gemini-2.5-flash': {
      // Note: Using non-thinking output cost
      cost: { input: 0.3, output: 2.5 }, // Input assumes text/image/video cost
    },
    'gemini-2.5-flash-preview-05-20': {
      // Note: Using non-thinking output cost
      cost: { input: 0.15, output: 0.6 }, // Input assumes text/image/video cost
    },
    'gemini-2.5-flash-preview-04-17': {
      // Note: Using non-thinking output cost
      cost: { input: 0.15, output: 0.6 }, // Input assumes text/image/video cost
    },
    // --- Gemini 2.0 Models ---
    'gemini-2.0-flash': { cost: { input: 0.1, output: 0.4 } },
    'gemini-2.0-flash-lite': { cost: { input: 0.075, output: 0.3 } },
    // --- Experimental / Free Tier ---
    'gemini-2.5-pro-exp-03-25': { cost: { input: 0, output: 0 } }, // Specific free tier model
    'gemini-2.0-flash-exp': { cost: { input: 0, output: 0 } },
    'gemini-2.0-pro-exp': { cost: { input: 0, output: 0 } },
    'gemini-2.0-flash-thinking-exp': { cost: { input: 0, output: 0 } },
    // --- Gemini 1.5 Models ---
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
    // --- Gemini 1.0 Models ---
    'gemini-1.0-pro': { cost: { input: 0.5, output: 1.5 } },
    'gemini-1.0-pro-001': { cost: { input: 0.5, output: 1.5 } },
    'gemini-1.0-pro-vision-latest': { cost: { input: 0.5, output: 1.5 } },
    'gemini-pro-vision': { cost: { input: 0.5, output: 1.5 } },
    // --- Other Models ---
    'imagen-3': { cost: { input: 0, output: 0.03, isPerImage: true } }, // Priced per image ($0.03)
    'veo-2': { cost: { input: 0, output: 0.35, isPerSecond: true } }, // Priced per second ($0.35)
    'gemma-3': { cost: { input: 0, output: 0 } }, // Free / Not applicable for token cost
    'text-embedding-004': { cost: { input: 0, output: 0 } }, // Free / Not applicable for token cost
  },
  modelName: (model: string) => {
    // Exact matches first for specific/preview models
    if (model === 'gemini-2.5-pro') return 'gemini-2.5-pro'
    if (model === 'gemini-2.5-pro-preview-05-06')
      return 'gemini-2.5-pro-preview-05-06'
    if (model === 'gemini-2.5-pro-preview-03-25')
      return 'gemini-2.5-pro-preview-03-25'
    if (model === 'gemini-2.5-pro-exp-03-25') return 'gemini-2.5-pro-exp-03-25'
    if (model === 'gemini-2.5-pro-preview-03-25')
      return 'gemini-2.5-pro-preview-03-25'
    if (model === 'gemini-2.5-flash-lite-preview-06-17')
      return 'gemini-2.5-flash-lite-preview-06-17'
    if (model === 'gemini-2.5-flash') return 'gemini-2.5-flash'
    if (model === 'gemini-2.5-flash-preview-05-20')
      return 'gemini-2.5-flash-preview-05-20'
    if (model === 'gemini-2.5-flash-preview-04-17')
      return 'gemini-2.5-flash-preview-04-17'
    if (model === 'imagen-3') return 'imagen-3'
    if (model === 'veo-2') return 'veo-2'
    if (model === 'gemma-3') return 'gemma-3'
    if (model === 'text-embedding-004') return 'text-embedding-004'

    // Handle variations using startsWith
    if (model.startsWith('gemini-2.0-flash-thinking-exp')) {
      return 'gemini-2.0-flash-thinking-exp'
    }
    if (model.startsWith('gemini-2.0-pro-exp')) return 'gemini-2.0-pro-exp'
    if (model.startsWith('gemini-2.0-flash-lite-'))
      return 'gemini-2.0-flash-lite'
    if (model.startsWith('gemini-2.0-flash-')) return 'gemini-2.0-flash'

    if (model.startsWith('gemini-1.5-pro-')) return 'gemini-1.5-pro'
    if (model.startsWith('gemini-1.0-flash-8b-')) return 'gemini-1.5-flash-8b' // Note: Check if this naming is correct, usually 1.5
    if (model.startsWith('gemini-1.5-flash-')) return 'gemini-1.5-flash'
    if (model.startsWith('gemini-1.0-pro-')) return 'gemini-1.0-pro'

    // Return the default model if no match is found
    return 'gemini-1.5-flash'
  },
})
