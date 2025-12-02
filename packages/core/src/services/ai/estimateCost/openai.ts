import {
  createModelSpec,
  ReasoningCapabilities,
  ReasoningEffort,
  ReasoningSummary,
} from './helpers'

// source: https://openai.com/api/pricing/
// NOTE: Order matters here, the first model is the default model

const GPT_5_1_REASONING: ReasoningCapabilities = {
  reasoningEffort: ['none', 'minimal', 'low', 'medium', 'high'],
  reasoningSummary: ['auto', 'detailed'],
}

const GPT_5_REASONING: ReasoningCapabilities = {
  reasoningEffort: ['minimal', 'low', 'medium', 'high'],
  reasoningSummary: ['auto', 'detailed'],
}

export const OPENAI_MODELS = createModelSpec({
  defaultModel: 'gpt-4o-mini',
  models: {
    // gpt-5 family
    'gpt-5.1': {
      cost: { input: 1.25, output: 10.0 },
      reasoning: GPT_5_1_REASONING,
    },
    'gpt-5': {
      cost: { input: 1.25, output: 10.0 },
      reasoning: GPT_5_REASONING,
    },
    'gpt-5-mini': {
      cost: { input: 0.25, output: 2.0 },
      reasoning: GPT_5_REASONING,
    },
    'gpt-5-nano': {
      cost: { input: 0.05, output: 0.4 },
      reasoning: GPT_5_REASONING,
    },
    'gpt-5-pro': {
      cost: { input: 15.0, output: 120.0 },
      reasoning: GPT_5_REASONING,
    },

    // gpt-4.1 family
    'gpt-4.1': { cost: { input: 2.0, output: 8.0 } },
    'gpt-4.1-mini': { cost: { input: 0.4, output: 1.6 } },
    'gpt-4.1-nano': { cost: { input: 0.1, output: 0.4 } },

    // gpt-4o family
    'gpt-4o': { cost: { input: 2.5, output: 10.0 } },
    'gpt-4o-mini': { cost: { input: 0.15, output: 0.6 } },

    // o1 family
    o1: { cost: { input: 15.0, output: 60.0 } },
    'o1-pro': { cost: { input: 150.0, output: 600.0 } },
    'o1-mini': { cost: { input: 1.1, output: 4.4 } },

    // o3 family
    o3: { cost: { input: 10.0, output: 40.0 } },
    'o3-mini': { cost: { input: 1.1, output: 4.4 } },

    // o4 family
    'o4-mini': { cost: { input: 1.1, output: 4.4 } },

    // computer-use family
    'computer-use-preview': {
      cost: { input: 3.0, output: 12.0 },
      hidden: true,
    },
  },
})

export type { ReasoningCapabilities, ReasoningEffort, ReasoningSummary }
