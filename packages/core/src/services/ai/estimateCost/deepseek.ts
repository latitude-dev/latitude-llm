import { createModelSpec } from './helpers'

export const DEEPSEEK_MODELS = createModelSpec({
  defaultModel: 'deepseek-chat',
  models: {
    'deepseek-chat': {
      cost: { input: 0.1, output: 0.2 },
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
})
