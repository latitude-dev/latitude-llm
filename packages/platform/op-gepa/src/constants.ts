export const GEPA_PYTHON_ENTRY_MODULE = "op_gepa_engine.main"

export const GEPA_DEFAULT_SEED = 310700

export const GEPA_MAX_TIME = 60 * 60

export const GEPA_MAX_TOKENS = 100_000_000

// Number of failure trajectories sampled per reflection round. Higher values
// give the proposer broader context per iteration at the cost of more input
// tokens; lower values run faster but see less of the failure surface.
export const GEPA_DEFAULT_REFLECTION_SIZE = 5

// Number of iterations without improvement before giving up on optimization.
// Inversely scaled with the minibatch size: smaller minibatches see a noisier
// per-iteration validation delta and need more patience to recover from noise,
// while larger minibatches give a more representative signal so a flat stretch
// is a stronger exhaustion signal. Floored at 10 for very large minibatches.
export const GEPA_MAX_STAGNATION = Math.max(10, Math.ceil(100 / GEPA_DEFAULT_REFLECTION_SIZE))

export const GEPA_BATCH_SIZE = 10

export const GEPA_RPC_METHODS = {
  optimize: "gepa_optimize",
  evaluate: "gepa_evaluate",
  propose: "gepa_propose",
} as const

// Opus 4.7 not working:
// https://github.com/vercel/ai/issues/14773
export const GEPA_PROPOSER_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-sonnet-4-6",
  reasoning: "high",
} as const
