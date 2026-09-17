export const FLAGGER_DEFAULT_SAMPLING = 10

export const FLAGGER_SCORING_ARTIFACT_VERSION = "flagger-classification-v1"

export const FLAGGER_SCREENING_ARTIFACT_VERSION = "flagger-screening-v1"
export const FLAGGER_SCREENING_RETENTION_DAYS = 90

export const FLAGGER_SCREENING_SELECTION_REASONS = [
  "deterministic",
  "hinted",
  "uniform-sample",
  "ordinary-sample",
  "skipped",
  "rate-limited",
  "jev-preclassifier",
] as const

export const FLAGGER_SCREENING_OUTCOMES = [
  "matched",
  "unmatched",
  "success",
  "failure",
  "indeterminate",
  "notApplicable",
  "error",
] as const

export const JEV_PRECLASSIFIER_ENABLED = false
export const JEV_PRECLASSIFIER_STRATEGY_SLUGS = [
  "frustration",
  "nsfw",
  "refusal",
  "laziness",
  "jailbreaking",
  "forgetting",
  "trashing",
  "bluffing",
  "pii-leakage",
  "incompletion",
  "task-failure",
] as const
export const JEV_PRECLASSIFIER_THRESHOLD = 0.5
export const JEV_PRECLASSIFIER_POLICY_VERSION = "jev-preclassifier-policy-v1"
export const JEV_PRECLASSIFIER_STATE_BUILDER_VERSION = "jev-preclassifier-state-v1"
export const JEV_PRECLASSIFIER_RETENTION_DAYS = 90
export const JEV_PRECLASSIFIER_OPERATION_TIMEOUT_MS = 5_000
export const JEV_PRECLASSIFIER_DECISIONS = ["gated-in", "below-threshold", "unknown"] as const

export const JEV_SHADOW_ENABLED = false
export const JEV_SHADOW_STRATEGY_SLUGS = ["frustration", "refusal"] as const
export const JEV_SHADOW_FRUSTRATION_THRESHOLD = 0.5
export const JEV_SHADOW_REFUSAL_THRESHOLD = 0.5
export const JEV_SHADOW_FRUSTRATION_QUESTION_VERSION = "jev-frustration-v1"
export const JEV_SHADOW_REFUSAL_QUESTION_VERSION = "jev-refusal-v1"
export const JEV_SHADOW_POLICY_VERSION = "jev-shadow-policy-v1"
export const JEV_SHADOW_STATE_BUILDER_VERSION = "jev-shadow-state-v1"
export const JEV_SHADOW_RETENTION_DAYS = 90
export const JEV_SHADOW_OPERATION_TIMEOUT_MS = 3_000
export const JEV_SHADOW_PROVIDER_FAILURE_KINDS = [
  "timeout",
  "authentication",
  "rate-limit",
  "malformed-response",
  "provider",
] as const
export const JEV_SHADOW_DECISIONS = ["would-run", "would-skip", "unknown"] as const
export const JEV_SHADOW_OBSERVATION_STATUSES = [
  "disabled",
  "success",
  "unsupported-slug",
  "missing-selection",
  "timeout",
  "authentication",
  "rate-limited",
  "provider-failure",
  "malformed-response",
] as const

// Independent fixed windows per org+slug; sampled sessions with positive hints
// (satisfaction/resolution) get the smallest budget.
export const FLAGGER_HINTED_RATE_LIMIT = {
  maxRequests: 30,
  windowSeconds: 60,
} as const

export const FLAGGER_SAMPLED_RATE_LIMIT = {
  maxRequests: 25,
  windowSeconds: 60,
} as const

export const FLAGGER_SAMPLED_POSITIVE_RATE_LIMIT = {
  maxRequests: 5,
  windowSeconds: 60,
} as const

export const FLAGGER_PROMPT_MAX_HINTS = 20
export const FLAGGER_HINT_EVIDENCE_MAX_CHARS = 256
export const FLAGGER_PROMPT_MAX_DEFINED_TOOLS = 40

export const FLAGGER_CONTEXT_WINDOW = 8

export const MAX_STAGES_PER_PROMPT = 3

export const MAX_SUSPICIOUS_SNIPPETS = 5
export const MAX_EXCERPT_LENGTH = 500
export const MAX_SNIPPET_EXCERPT_LENGTH = 300

export const FLAGGER_DEFAULT_CLASSIFIER_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-haiku-4-5-20251001-v1:0",
  temperature: 0,
  maxTokens: 512,
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

export const FLAGGER_INSPECTED_AGENT_VERBATIM_MAX_CHARS = 6_000

export const FLAGGER_INSPECTED_AGENT_SIMILARITY_MAX_HAMMING = 6

export const FLAGGER_INSPECTED_AGENT_INDEX_MAX_ENTRIES = 16

export const FLAGGER_DRAFT_DEFAULTS = {
  passed: false,
  value: 0,
} as const

/**
 * Who last set a flagger's sampling rate.
 *
 * `default` is a provisioned row nobody has touched, `derived` is the Agent Score sweep's
 * traffic-aware rate, and `user` is a deliberate choice. The sweep writes over the first two and
 * never the third: a rate somebody set is a decision, not a starting point.
 */
export const FLAGGER_SAMPLING_SOURCES = ["default", "derived", "user"] as const
export type FlaggerSamplingSource = (typeof FLAGGER_SAMPLING_SOURCES)[number]
