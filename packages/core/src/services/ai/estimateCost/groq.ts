import { createModelSpec } from './helpers'

// source: https://groq.com/pricing/
export const GROQ_MODELS = createModelSpec({
  defaultModel: 'llama-3.3-70b-versatile',
  models: {
    // Production Models - Large Language Models
    'llama-3.3-70b-versatile': { cost: { input: 0.59, output: 0.79 } },
    'llama-3.1-8b-instant': { cost: { input: 0.05, output: 0.08 } },
    'gemma2-9b-it': { cost: { input: 0.2, output: 0.2 } },

    // Preview Models - Large Language Models
    'moonshotai/kimi-k2-instruct': { cost: { input: 1.0, output: 3.0 } },
    'meta-llama/llama-4-scout-17b-16e-instruct': {
      cost: { input: 0.11, output: 0.34 },
    },
    'meta-llama/llama-4-maverick-17b-128e-instruct': {
      cost: { input: 0.2, output: 0.6 },
    },
    'meta-llama/llama-guard-4-12b': { cost: { input: 0.2, output: 0.2 } },
    'deepseek-r1-distill-llama-70b': { cost: { input: 0.75, output: 0.99 } },
    'qwen/qwen3-32b': { cost: { input: 0.59, output: 0.79 } },
    'mistral-saba-24b': { cost: { input: 0.32, output: 0.52 } },
    'meta-llama/llama-prompt-guard-2-22m': {
      cost: { input: 0.2, output: 0.2 },
    },
    'meta-llama/llama-prompt-guard-2-86m': {
      cost: { input: 0.2, output: 0.2 },
    },

    // Legacy models (still supported but not in current docs)
    'llama3-70b-8192': { cost: { input: 0.59, output: 0.79 } },
    'llama3-8b-8192': { cost: { input: 0.05, output: 0.08 } },
    'llama-guard-3-8b': { cost: { input: 0.2, output: 0.2 } },
    'mixtral-8x7b-32768': { cost: { input: 0.24, output: 0.24 } },
  },
  modelName: (model: string) => {
    // Kimi K2 models
    if (model.includes('kimi-k2')) {
      return 'moonshotai/kimi-k2-instruct'
    }

    // Llama 4 models
    if (model.includes('llama-4-scout') || model.includes('llama4-scout')) {
      return 'meta-llama/llama-4-scout-17b-16e-instruct'
    }
    if (model.includes('llama-4-maverick') || model.includes('llama4-maverick')) {
      return 'meta-llama/llama-4-maverick-17b-128e-instruct'
    }

    // Llama Guard 4
    if (model.includes('llama-guard-4')) {
      return 'meta-llama/llama-guard-4-12b'
    }

    // Llama Prompt Guard 2
    if (model.includes('llama-prompt-guard-2-22m')) {
      return 'meta-llama/llama-prompt-guard-2-22m'
    }
    if (model.includes('llama-prompt-guard-2-86m')) {
      return 'meta-llama/llama-prompt-guard-2-86m'
    }

    // Qwen 3 models
    if (model.includes('qwen3-32b') || model.includes('qwen/qwen3-32b')) {
      return 'qwen/qwen3-32b'
    }

    // Mistral models
    if (model.includes('mistral-saba')) {
      return 'mistral-saba-24b'
    }

    // Gemma models
    if (model.includes('gemma2-9b')) {
      return 'gemma2-9b-it'
    }

    // Llama 3.3 models
    if (model.includes('llama-3.3-70b') || model.includes('llama3.3-70b')) {
      return 'llama-3.3-70b-versatile'
    }

    // Llama 3.1 models
    if (model.includes('llama-3.1-8b') || model.includes('llama3.1-8b')) {
      return 'llama-3.1-8b-instant'
    }

    // Legacy Llama 3 models
    if (model.includes('llama3-70b')) {
      return 'llama3-70b-8192'
    }
    if (model.includes('llama3-8b')) {
      return 'llama3-8b-8192'
    }

    // Llama Guard 3
    if (model.includes('llama-guard-3')) {
      return 'llama-guard-3-8b'
    }

    // Mixtral models
    if (model.includes('mixtral')) {
      return 'mixtral-8x7b-32768'
    }

    // DeepSeek models
    if (model.includes('deepseek-r1')) {
      return 'deepseek-r1-distill-llama-70b'
    }
  },
})
