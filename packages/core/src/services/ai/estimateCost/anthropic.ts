import { createModelSpec } from './helpers'

// source: https://docs.anthropic.com/en/docs/about-claude/models
export const ANTHROPIC_MODELS = createModelSpec({
  defaultModel: 'claude-sonnet-4-0',
  models: {
    'claude-opus-4-1': { cost: { input: 15.0, output: 75.0 } },

    'claude-sonnet-4-0': { cost: { input: 3.0, output: 15.0 } },

    'claude-opus-4-0': { cost: { input: 15.0, output: 75.0 } },

    'claude-3-7-sonnet-latest': { cost: { input: 3.0, output: 15.0 } },

    'claude-3-5-sonnet-latest': { cost: { input: 3.0, output: 15.0 } },

    'claude-3-5-haiku-latest': { cost: { input: 0.8, output: 4.0 } },
  },
})
