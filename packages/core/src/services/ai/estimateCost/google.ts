import type { ModelCost } from '.'

export function getCostPer1MGoogle(model: string): ModelCost {
  return GOOGLE_MODEL_COST_PER_1M_TOKENS[modelName(model)]!
}

// source: https://openai.com/api/pricing/
const GOOGLE_MODEL_COST_PER_1M_TOKENS = {
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-latest': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
  'gemini-1.5-flash-8b-latest': { input: 0.0375, output: 0.15 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-pro-latest': { input: 1.25, output: 5 },
  'gemini-1.0-pro': { input: 0.5, output: 1.5 },
  'gemini-1.0-pro-latest': { input: 0.5, output: 1.5 },
} as Record<string, ModelCost>

function modelName(model: string): string {
  if (model in GOOGLE_MODEL_COST_PER_1M_TOKENS) return model

  return 'gemini-1.5-flash'
}
