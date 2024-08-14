import type { ModelCost } from '.'

// source: https://mistral.ai/technology/#pricing
const MISTRAL_MODEL_COST_PER_1M_TOKENS = {
  'open-mistral-nemo-2407': { input: 0.3, output: 0.3 },
  'mistral-large-2407': { input: 3.0, output: 9.0 },

  'codestral-2405': { input: 1.0, output: 3.0 },

  'open-mistral-7b': { input: 0.25, output: 0.25 },
  'open-mixtral-8x7b': { input: 0.7, output: 0.7 },
  'open-mixtral-8x22b': { input: 2.0, output: 6.0 },
  'mistral-small-latest': { input: 1.0, output: 3.0 },
  'mistral-medium-latest': { input: 2.75, output: 8.1 },
} as Record<string, ModelCost>

function modelName(model: string): string {
  if (model in MISTRAL_MODEL_COST_PER_1M_TOKENS) return model

  if (model.startsWith('open-mistral-nemo')) return 'open-mistral-nemo-2407'
  if (model.startsWith('mistral-large')) return 'mistral-large-2407'

  if (model.startsWith('codestral')) return 'codestral-2405'

  if (model.startsWith('open-mistral')) return 'open-mistral-7b'
  if (model.startsWith('open-mixtral-8x7b')) return 'open-mixtral-8x7b'
  if (model.startsWith('open-mixtral-8x22b')) return 'open-mixtral-8x22b'
  if (model.startsWith('open-mixtral')) return 'open-mixtral-8x7b'
  if (model.startsWith('mistral-small')) return 'mistral-small-latest'
  if (model.startsWith('mistral-medium')) return 'mistral-medium-latest'

  return 'open-mistral-nemo-2407'
}

export function getCostPer1MMistral(model: string): ModelCost {
  return MISTRAL_MODEL_COST_PER_1M_TOKENS[modelName(model)]!
}
