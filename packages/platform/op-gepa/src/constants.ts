export const GEPA_PYTHON_ENTRY_MODULE = "op_gepa_engine.main"

export const GEPA_DEFAULT_SEED = 310700

export const GEPA_MAX_TIME = 2 * 60 * 60

export const GEPA_MAX_TOKENS = 100_000_000

export const GEPA_MAX_STAGNATION = 10

export const GEPA_BATCH_SIZE = 10

export const GEPA_RPC_METHODS = {
  optimize: "gepa_optimize",
  evaluate: "gepa_evaluate",
  propose: "gepa_propose",
} as const

export const GEPA_PROPOSER_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-opus-4-7",
  reasoning: "xhigh",
} as const
