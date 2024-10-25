import type { ModelCost } from '.'

// source: https://docs.anthropic.com/en/docs/about-claude/models
const ANTHROPIC_MODEL_COST_PER_1M_TOKENS = {
  'claude-3-5-sonnet-latest': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20240620': { input: 3.0, output: 15.0 },
  'claude-3-opus-latest': { input: 15.0, output: 75.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-latest': { input: 0.25, output: 1.25 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

  'claude-2.1': { input: 8.0, output: 24.0 },
  'claude-2.0': { input: 8.0, output: 24.0 },
  'claude-instant-1.2': { input: 0.8, output: 2.4 },
} as Record<string, ModelCost>

function modelName(model: string): string {
  if (model in ANTHROPIC_MODEL_COST_PER_1M_TOKENS) return model

  if (model.startsWith('claude-3-5-sonnet')) return 'claude-3-5-sonnet-20240620'
  if (model.startsWith('claude-3-opus')) return 'claude-3-opus-20240229'
  if (model.startsWith('claude-3-sonnet')) return 'claude-3-sonnet-20240229'
  if (model.startsWith('claude-3-haiku')) return 'claude-3-haiku-20240307'

  if (model.startsWith('claude-2.1')) return 'claude-2.1'
  if (model.startsWith('claude-2.0')) return 'claude-2.0'
  if (model.startsWith('claude-instant-1.2')) return 'claude-instant-1.2'

  return 'claude-3-5-sonnet-20240620'
}

export function getCostPer1MAnthropic(model: string): ModelCost {
  return ANTHROPIC_MODEL_COST_PER_1M_TOKENS[modelName(model)]!
}
