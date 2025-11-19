import { createModelSpec } from './helpers'

// https://ai.google.dev/pricing
// Also for getting the full list of models
// https://generativelanguage.googleapis.com/v1beta/models/?key=[YOUR_GEMINI_KEY]

export const GOOGLE_MODELS = createModelSpec({
  defaultModel: 'gemini-2.5-flash',
  models: {
    // --- Gemini 3 Models ---
    'gemini-3-pro-preview': {
      cost: [
        { input: 2.0, output: 12.0 },
        { input: 4.0, output: 18.0, tokensRangeStart: 200_000 },
      ],
    },

    // --- Gemini 2.5 Models ---
    'gemini-2.5-pro': {
      // Note: Pricing includes thinking tokens
      cost: [
        { input: 1.25, output: 10.0 },
        { input: 2.5, output: 15.0, tokensRangeStart: 200_000 },
      ],
    },
    'gemini-2.5-flash': {
      // Note: Using non-thinking output cost
      cost: { input: 0.3, output: 2.5 }, // Input assumes text/image/video cost
    },
    'gemini-2.5-flash-lite': {
      cost: { input: 0.1, output: 0.4 }, // Input assumes text/image/video cost
    },

    // --- Gemini 2.0 Models ---
    'gemini-2.0-flash': { cost: { input: 0.15, output: 0.6 } },
    'gemini-2.0-flash-lite': { cost: { input: 0.075, output: 0.3 } },

    // --- Other Models ---
    'imagen-3': { cost: { input: 0, output: 0.03, isPerImage: true } }, // Priced per image ($0.03)
    'veo-2': { cost: { input: 0, output: 0.35, isPerSecond: true } }, // Priced per second ($0.35)
    'gemma-3': { cost: { input: 0, output: 0 } }, // Free / Not applicable for token cost
    'text-embedding-004': { cost: { input: 0, output: 0 } }, // Free / Not applicable for token cost
  },
})
