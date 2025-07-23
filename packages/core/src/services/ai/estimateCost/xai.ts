import { createModelSpec } from './helpers'

export const XAI_MODELS = createModelSpec({
  defaultModel: 'grok-4-0709',
  models: {
    'grok-4-0709': {
      cost: { input: 3.0, output: 15.0 },
    },
    'grok-3': {
      cost: { input: 3.0, output: 15.0 },
    },
    'grok-3-fast': {
      cost: { input: 5, output: 25 },
    },
    'grok-3-mini': {
      cost: { input: 0.3, output: 0.5 },
    },
    'grok-3-mini-fast': {
      cost: { input: 0.6, output: 4 },
    },
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
  modelName: (model: string) => {
    if (model.startsWith('grok-4-0709')) return 'grok-4-0709'
    if (model.startsWith('grok-3')) return 'grok-3'
    if (model.startsWith('grok-3-fast')) return 'grok-3-fast'
    if (model.startsWith('grok-3-mini')) return 'grok-3-mini'
    if (model.startsWith('grok-3-mini-fast')) return 'grok-3-mini-fast'
    if (model.startsWith('grok-2-1212')) return 'grok-2-1212'
    if (model.startsWith('grok-2-vision-1212')) return 'grok-2-vision-1212'
    if (model.startsWith('grok-beta')) return 'grok-beta'
    if (model.startsWith('grok-vision-beta')) return 'grok-vision-beta'
  },
})
