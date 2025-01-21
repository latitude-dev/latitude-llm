import type { ModelCost } from '.'

// source: https://openai.com/api/pricing/
const OPENAI_MODEL_COST_PER_1M_TOKENS = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-2024-08-06': { input: 2.5, output: 10.0 },
  'gpt-4o-2024-05-13': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 },

  o1: { input: 15.0, output: 60.0 },
  'o1-2024-12-17': { input: 15.0, output: 60.0 },
  'o1-preview': { input: 15.0, output: 60.0 },
  'o1-preview-2024-09-12': { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0 },
  'o1-mini-2024-09-12': { input: 3.0, output: 12.0 },

  'chatgpt-4o-latest': { input: 5.0, output: 15.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4-turbo-2024-04-09': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-32k': { input: 60.0, output: 120.0 },
  'gpt-4-0125-preview': { input: 10.0, output: 30.0 },
  'gpt-4-1106-preview': { input: 10.0, output: 30.0 },
  'gpt-4-vision-preview': { input: 10.0, output: 30.0 },
  'gpt-3.5-turbo-0125': { input: 0.5, output: 1.5 },
  'gpt-3.5-turbo-instruct': { input: 1.5, output: 2.0 },
  'gpt-3.5-turbo-1106': { input: 1.0, output: 2.0 },
  'gpt-3.5-turbo-0613': { input: 1.5, output: 2.0 },
  'gpt-3.5-turbo-16k-0613': { input: 3.0, output: 4.0 },
  'gpt-3.5-turbo-0301': { input: 1.5, output: 2.0 },
  'davinci-002': { input: 2.0, output: 2.0 },
  'babbage-002': { input: 0.4, output: 0.4 },
} as Record<string, ModelCost>

function modelName(model: string): string {
  if (model in OPENAI_MODEL_COST_PER_1M_TOKENS) return model

  if (model.startsWith('gpt-4o-')) return 'gpt-4o'
  if (model.startsWith('gpt-4-')) return 'gpt-4'
  if (model.startsWith('gpt-3.5-turbo-16k')) return 'gpt-3.5-turbo-16k-0613'
  if (model.startsWith('gpt-3.5-turbo')) return 'gpt-3.5-turbo-0613'

  return 'gpt-4o'
}

export function getCostPer1MOpenAI(model: string): ModelCost {
  return OPENAI_MODEL_COST_PER_1M_TOKENS[modelName(model)]!
}
