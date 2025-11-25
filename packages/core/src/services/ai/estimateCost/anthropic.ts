import { createModelSpec } from './helpers'

// source: https://platform.claude.com/docs/en/about-claude/pricing
export const ANTHROPIC_MODELS = createModelSpec({
  defaultModel: 'claude-sonnet-4-0',
  models: {
    // Claude 4.5 models
    'claude-opus-4-5': { cost: { input: 5.0, output: 25.0 } },
    'claude-sonnet-4-5': { cost: { input: 3.0, output: 15.0 } },
    'claude-haiku-4-5': { cost: { input: 1.0, output: 5.0 } },

    // Claude 4.1 models
    'claude-opus-4-1': { cost: { input: 15.0, output: 75.0 } },

    // Claude 4 models
    'claude-opus-4-0': { cost: { input: 15.0, output: 75.0 } },
    'claude-sonnet-4-0': { cost: { input: 3.0, output: 15.0 } },

    // Claude 3.7 models (deprecated)
    'claude-3-7-sonnet-latest': { cost: { input: 3.0, output: 15.0 } },

    // Claude 3.5 models
    'claude-3-5-sonnet-latest': { cost: { input: 3.0, output: 15.0 } },
    'claude-3-5-haiku-latest': { cost: { input: 0.8, output: 4.0 } },

    // Claude 3 models (deprecated)
    'claude-opus-3': { cost: { input: 15.0, output: 75.0 } },
    'claude-haiku-3': { cost: { input: 0.25, output: 1.25 } },
  },
})
