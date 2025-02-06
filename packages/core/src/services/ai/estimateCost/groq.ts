import { createModelSpec } from './helpers'

// source: https://groq.com/pricing/
export const GROQ_MODELS = createModelSpec({
  defaultModel: 'gemma2-9b-it',
  models: {
    'gemma-7b-it': { cost: { input: 0.07, output: 0.07 } },
    'gemma2-9b-it': { cost: { input: 0.2, output: 0.2 } },

    'llama-3.2-1b-preview': { cost: { input: 0.04, output: 0.04 } },
    'llama-3.2-3b-preview': { cost: { input: 0.06, output: 0.06 } },
    'llama-3.3-70b-versatile': { cost: { input: 0.59, output: 0.79 } },
    'llama-3.1-8b-instant': { cost: { input: 0.05, output: 0.08 } },
    'llama-3.3-70b-specdec': { cost: { input: 0.59, output: 0.99 } },
    'llama3-70b-8192': { cost: { input: 0.59, output: 0.79 } },
    'llama3-8b-8192': { cost: { input: 0.05, output: 0.08 } },
    'llama-3.2-11b-vision-preview': { cost: { input: 0.18, output: 0.18 } },
    'llama-3.2-90b-vision-preview': { cost: { input: 0.9, output: 0.9 } },
    'llama-guard-3-8b': { cost: { input: 0.05, output: 0.08 } },
    'llama3-groq-70b-8192-tool-use-preview': {
      cost: { input: 0.89, output: 0.89 },
    },
    'llama3-groq-8b-8192-tool-use-preview': {
      cost: { input: 0.19, output: 0.19 },
    },

    'mixtral-8x7b-32768': { cost: { input: 0.24, output: 0.24 } },

    'deepseek-r1-distill-llama-70b': {
      cost: [
        { input: 0.75, output: 0.99 },
        { input: 3, output: 3, tokensRangeStart: 4000 },
        { input: 5, output: 5, tokensRangeStart: 32000 },
      ],
    },
  },
  modelName: (model: string) => {
    if (model.startsWith('gemma-')) return 'gemma-7b-it'
    if (model.startsWith('gemma2-')) return 'gemma2-9b-it'

    if (model.startsWith('llama3-70b')) return 'llama3-70b-8192'
    if (model.startsWith('llama3-8b')) return 'llama3-8b-8192'
    if (model.startsWith('llama3.1-70b')) return 'llama3-70b-8192'
    if (model.startsWith('llama3.1-8b')) return 'llama3-8b-8192'
    if (model.startsWith('llama')) return 'llama-guard-3-8b'

    if (model.startsWith('mixtral')) return 'mixtral-8x7b-32768'

    if (model.startsWith('deepseek-r1-')) return 'deepseek-r1-distill-llama-70b'
  },
})
