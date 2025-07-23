import { createModelSpec } from './helpers'

export const AMAZON_BEDROCK_MODELS = createModelSpec({
  defaultModel: 'anthropic.claude-sonnet-4-20250514-v1:0',
  models: {
    // Anthropic Claude 4 Models
    'anthropic.claude-sonnet-4-20250514-v1:0': {
      cost: { input: 3.0, output: 15.0 },
    },
    'anthropic.claude-opus-4-20250514-v1:0': {
      cost: { input: 15.0, output: 75.0 },
    },

    // Anthropic Claude 3.7 Models
    'anthropic.claude-3-7-sonnet-20250219-v1:0': {
      cost: { input: 3.0, output: 15.0 },
    },

    // Anthropic Claude 3.5 Models
    'anthropic.claude-3-5-sonnet-20241022-v2:0': {
      cost: { input: 3.0, output: 15.0 },
    },
    'anthropic.claude-3-5-sonnet-20240620-v1:0': {
      cost: { input: 3.0, output: 15.0 },
    },
    'anthropic.claude-3-5-haiku-20241022-v1:0': {
      cost: { input: 0.8, output: 4.0 },
    },

    // Anthropic Claude 3 Models
    'anthropic.claude-3-sonnet-20240229-v1:0': {
      cost: { input: 3.0, output: 15.0 },
    },
    'anthropic.claude-3-haiku-20240307-v1:0': {
      cost: { input: 0.25, output: 1.25 },
    },
    'anthropic.claude-3-opus-20240229-v1:0': {
      cost: { input: 15.0, output: 75.0 },
    },

    // Meta Llama Models
    'meta.llama2-70b-chat:0': {
      cost: { input: 0.2, output: 0.2 },
    },
    'meta.llama2-13b-chat:0': {
      cost: { input: 0.1, output: 0.1 },
    },

    // Amazon Titan Models
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
  modelName: (model: string) => {
    if (model === 'anthropic.claude-sonnet-4-20250514-v1:0') {
      return 'anthropic.claude-sonnet-4-20250514-v1:0'
    }

    if (model === 'anthropic.claude-opus-4-20250514-v1:0') {
      return 'anthropic.claude-opus-4-20250514-v1:0'
    }

    if (model === 'anthropic.claude-3-7-sonnet-20250219-v1:0') {
      return 'anthropic.claude-3-7-sonnet-20250219-v1:0'
    }

    if (model === 'anthropic.claude-3-5-sonnet-20241022-v2:0') {
      return 'anthropic.claude-3-5-sonnet-20241022-v2:0'
    }

    if (model === 'anthropic.claude-3-5-sonnet-20240620-v1:0') {
      return 'anthropic.claude-3-5-sonnet-20240620-v1:0'
    }

    if (model === 'anthropic.claude-3-5-haiku-20241022-v1:0') {
      return 'anthropic.claude-3-5-haiku-20241022-v1:0'
    }

    if (model === 'anthropic.claude-3-sonnet-20240229-v1:0') {
      return 'anthropic.claude-3-sonnet-20240229-v1:0'
    }

    if (model === 'anthropic.claude-3-haiku-20240307-v1:0') {
      return 'anthropic.claude-3-haiku-20240307-v1:0'
    }

    if (model === 'anthropic.claude-3-opus-20240229-v1:0') {
      return 'anthropic.claude-3-opus-20240229-v1:0'
    }

    if (model === 'meta.llama2-70b-chat:0') {
      return 'meta.llama2-70b-chat:0'
    }

    if (model === 'meta.llama2-13b-chat:0') {
      return 'meta.llama2-13b-chat:0'
    }

    if (model === 'amazon.titan-text-lite-v1:0') {
      return 'amazon.titan-text-lite-v1:0'
    }

    if (model === 'amazon.titan-text-express-v1:0') {
      return 'amazon.titan-text-express-v1:0'
    }

    if (model === 'amazon.titan-embed-text-v1:0') {
      return 'amazon.titan-embed-text-v1:0'
    }
  },
})
