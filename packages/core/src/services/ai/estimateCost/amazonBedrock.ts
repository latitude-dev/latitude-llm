import { createModelSpec } from './helpers'

export const AMAZON_BEDROCK_MODELS = createModelSpec({
  defaultModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
  models: {
    'anthropic.claude-3-sonnet-20240229-v1:0': {
      cost: { input: 0.3, output: 1.5 },
    },
    'anthropic.claude-3-haiku-20240307-v1:0': {
      cost: { input: 0.25, output: 1.25 },
    },
    'anthropic.claude-3-opus-20240229-v1:0': {
      cost: { input: 1.5, output: 7.5 },
    },
    'meta.llama2-70b-chat:0': {
      cost: { input: 0.2, output: 0.2 },
    },
    'meta.llama2-13b-chat:0': {
      cost: { input: 0.1, output: 0.1 },
    },
    'amazon.titan-text-lite-v1:0': {
      cost: { input: 0.1, output: 0.1 },
    },
    'amazon.titan-text-express-v1:0': {
      cost: { input: 0.1, output: 0.1 },
    },
    'amazon.titan-embed-text-v1:0': {
      cost: { input: 0.1, output: 0.1 },
    },
  },
})
