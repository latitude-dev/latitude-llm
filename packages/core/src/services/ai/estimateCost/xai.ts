import { createModelSpec } from './helpers'

export const XAI_MODELS = createModelSpec({
  defaultModel: 'grok-2-1212',
  models: {
    'grok-2-1212': {
      cost: { input: 0.1, output: 0.2 },
    },
    'grok-2-vision-1212': {
      cost: { input: 0.1, output: 0.2 },
    },
    'grok-beta': {
      cost: { input: 0.1, output: 0.2 },
    },
    'grok-vision-beta': {
      cost: { input: 0.1, output: 0.2 },
    },
  },
})
