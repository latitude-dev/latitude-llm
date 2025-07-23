import { createModelSpec } from './helpers'

export const DEEPSEEK_MODELS = createModelSpec({
  defaultModel: 'deepseek-v3',
  models: {
    'deepseek-v3': {
      cost: { input: 0.27, output: 1.1 },
    },
    'deepseek-r1': {
      cost: { input: 0.55, output: 2.19 },
    },
    'deepseek-chat': {
      cost: { input: 0.1, output: 0.2 },
    },
    'deepseek-reasoner': {
      cost: { input: 0.27, output: 0.55 },
    },
    'deepseek-coder': {
      cost: { input: 0.1, output: 0.2 },
    },
    'deepseek-coder-33b-instruct': {
      cost: { input: 0.1, output: 0.2 },
    },
    'deepseek-coder-6.7b-base': {
      cost: { input: 0.1, output: 0.2 },
    },
    'deepseek-coder-1.3b-base': {
      cost: { input: 0.1, output: 0.2 },
    },
  },
  modelName: (model: string) => {
    if (model.startsWith('deepseek-v3')) return 'deepseek-v3'
    if (model.startsWith('deepseek-r1')) return 'deepseek-r1'
    if (model.startsWith('deepseek-chat')) return 'deepseek-chat'
    if (model.startsWith('deepseek-reasoner')) return 'deepseek-reasoner'
    if (model.startsWith('deepseek-coder')) return 'deepseek-coder'
    if (model.startsWith('deepseek-coder-33b-instruct')) {
      return 'deepseek-coder-33b-instruct'
    }
    if (model.startsWith('deepseek-coder-6.7b-base')) {
      return 'deepseek-coder-6.7b-base'
    }
    if (model.startsWith('deepseek-coder-1.3b-base')) {
      return 'deepseek-coder-1.3b-base'
    }
  },
})
