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

export const FLAGGER_MODEL = {
  provider: "amazon-bedrock",
  model: "amazon.nova-lite-v1:0",
  temperature: 0,
} as const

export const FLAGGER_MAX_TOKENS = 512

export const FLAGGER_ANNOTATOR_MODEL = {
  provider: "amazon-bedrock",
  model: "amazon.nova-lite-v1:0",
  temperature: 0.2,
} as const

export const FLAGGER_ANNOTATOR_MAX_TOKENS = 2048

export const FLAGGER_DRAFT_DEFAULTS = {
  passed: false,
  value: 0,
  hasAnchor: false,
} as const
