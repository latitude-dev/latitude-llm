export const FLAGGER_DEFAULT_SAMPLING = 10

export const AMBIGUOUS_FLAGGER_DEFAULT_RATE_LIMIT = {
  maxRequests: 30,
  windowSeconds: 60,
} as const

export const FLAGGER_CONTEXT_WINDOW = 8

export const MAX_STAGES_PER_PROMPT = 3

export const MAX_SUSPICIOUS_SNIPPETS = 5
export const MAX_EXCERPT_LENGTH = 500
export const MAX_SNIPPET_EXCERPT_LENGTH = 300

export const FLAGGER_DEFAULT_CLASSIFIER_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-haiku-4-5-20251001-v1:0",
  temperature: 0,
  maxTokens: 2048,
} as const

export const FLAGGER_DEFAULT_INSTRUCTION_EXTRACTOR_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  temperature: 0,
  maxTokens: 512,
} as const

export const FLAGGER_DEFAULT_ANNOTATOR_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  temperature: 0.2,
  maxTokens: 2048,
} as const

export const FLAGGER_DRAFT_DEFAULTS = {
  passed: true,
  value: 1,
} as const
