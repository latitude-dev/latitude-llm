import type { ModelCost } from '.'

// source: https://console.groq.com/settings/billing
const GROQ_MODEL_COST_PER_1M_TOKENS = {
  'gemma-7b-it': { input: 0.07, output: 0.07 },
  'gemma2-9b-it': { input: 0.2, output: 0.2 },
  // 'llama-3.1-405b-reasoning': N/A
  // 'llama-3.1-70b-versatile': N/A
  // 'llama-3.1-8b-instant': N/A
  'llama3-70b-8192': { input: 0.59, output: 0.79 },
  'llama3-8b-8192': { input: 0.05, output: 0.08 },
  'llama-guard-3-8b': { input: 0.05, output: 0.08 },
  'llama3-groq-70b-8192-tool-use-preview': { input: 0.89, output: 0.89 },
  'llama3-groq-8b-8192-tool-use-preview': { input: 0.19, output: 0.19 },
  'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
} as Record<string, ModelCost>

function modelName(model: string): string {
  if (model in GROQ_MODEL_COST_PER_1M_TOKENS) return model

  if (model.startsWith('gemma-')) return 'gemma-7b-it'
  if (model.startsWith('gemma2-')) return 'gemma2-9b-it'
  if (model.startsWith('llama3-70b')) return 'llama3-70b-8192'
  if (model.startsWith('llama3-8b')) return 'llama3-8b-8192'
  if (model.startsWith('llama3.1-70b')) return 'llama3-70b-8192'
  if (model.startsWith('llama3.1-8b')) return 'llama3-8b-8192'
  if (model.startsWith('llama')) return 'llama-guard-3-8b'
  if (model.startsWith('mixtral')) return 'mixtral-8x7b-32768'

  return 'gemma2-9b-it'
}

export function getCostPer1MGroq(model: string): ModelCost {
  return GROQ_MODEL_COST_PER_1M_TOKENS[modelName(model)]!
}
