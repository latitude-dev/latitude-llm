import { createModelSpec } from './helpers'

// https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models
export const VERTEX_GOOGLE_MODELS = createModelSpec({
  defaultModel: 'gemini-1.5-flash-002',
  models: {
    'gemini-1.5-pro-002': {},
    'gemini-1.5-flash-001': {},
    'gemini-1.5-flash-002': {},
    'gemini-1.5-pro-001': {},
    'gemini-1.0-pro': {},
    'gemini-1.0-pro-001': {},
    'gemini-1.0-pro-vision-001': {},
    'gemini-1.0-pro-002': {},
  },
})
