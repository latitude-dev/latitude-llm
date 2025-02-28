import { createModelSpec } from './helpers'

// https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models
export const VERTEX_ANTHROPIC_MODELS = createModelSpec({
  defaultModel: 'claude-3-5-haiku@20241022',
  models: {
    'claude-3-7-sonnet@20250219': {},
    'claude-3-5-sonnet-v2@20241022': {},
    'claude-3-5-haiku@20241022': {},
    'claude-3-opus@20240229': {},
    'claude-3-5-sonnet@20240620': {},
    'claude-3-haiku@20240307': {},
  },
})
