import type { ModelConfig } from "@domain/shared/seeding"

/**
 * Per-1M-token USD rates, copied from `@domain/models`' registry entry for each
 * pair. The dashboard derives break-even from the registry rather than from these,
 * so a cohort priced differently here would show a position bar whose markers
 * disagree with its own spend.
 */
const model = (
  config: Omit<ModelConfig, "latencyRange" | "finishReasonStop" | "responseModel" | "scopeName">,
): ModelConfig => ({
  ...config,
  responseModel: config.model,
  scopeName: `${config.provider}-instrumentation`,
  latencyRange: [600, 2500],
  finishReasonStop: config.provider === "anthropic" ? "end_turn" : "stop",
})

/** Anthropic's 1.25x write / 0.1x read premium, so break-even lands at 21.7%. */
export const CLAUDE_OPUS_4_5 = model({
  provider: "anthropic",
  model: "claude-opus-4-5",
  costInPerMToken: 5,
  costOutPerMToken: 25,
  cacheReadPerMToken: 0.5,
  cacheWritePerMToken: 6.25,
})

export const CLAUDE_HAIKU_4_5 = model({
  provider: "anthropic",
  model: "claude-haiku-4-5",
  costInPerMToken: 1,
  costOutPerMToken: 5,
  cacheReadPerMToken: 0.1,
  cacheWritePerMToken: 1.25,
})

export const CLAUDE_OPUS_4_1 = model({
  provider: "anthropic",
  model: "claude-opus-4-1",
  costInPerMToken: 15,
  costOutPerMToken: 75,
  cacheReadPerMToken: 1.5,
  cacheWritePerMToken: 18.75,
})

/** No cache-write price at all, so break-even collapses to 0%. */
export const GPT_5_MINI = model({
  provider: "openai",
  model: "gpt-5-mini",
  costInPerMToken: 0.25,
  costOutPerMToken: 2,
  cacheReadPerMToken: 0.025,
})

export const GPT_5_NANO = model({
  provider: "openai",
  model: "gpt-5-nano",
  costInPerMToken: 0.05,
  costOutPerMToken: 0.4,
  cacheReadPerMToken: 0.005,
})

/** OpenAI with a write premium: same provider as `gpt-5.4-mini`, break-even 21.7%. */
export const GPT_5_6 = model({
  provider: "openai",
  model: "gpt-5.6",
  costInPerMToken: 5,
  costOutPerMToken: 30,
  cacheReadPerMToken: 0.5,
  cacheWritePerMToken: 6.25,
})

export const GPT_5_4_MINI = model({
  provider: "openai",
  model: "gpt-5.4-mini",
  costInPerMToken: 0.75,
  costOutPerMToken: 4.5,
  cacheReadPerMToken: 0.075,
})

export const GPT_5_4 = model({
  provider: "openai",
  model: "gpt-5.4",
  costInPerMToken: 2.5,
  costOutPerMToken: 15,
  cacheReadPerMToken: 0.25,
})

export const GEMINI_2_5_FLASH = model({
  provider: "google",
  model: "gemini-2.5-flash",
  costInPerMToken: 0.3,
  costOutPerMToken: 2.5,
  cacheReadPerMToken: 0.03,
})

export const GEMINI_2_5_FLASH_LITE = model({
  provider: "google",
  model: "gemini-2.5-flash-lite",
  costInPerMToken: 0.1,
  costOutPerMToken: 0.4,
  cacheReadPerMToken: 0.01,
})

/**
 * One-off models for the unhealthy archetype's long tail: enough distinct rows that
 * top-N + `Other models` has something to collapse, and thin enough that the
 * breakdown table's per-row averages are samples nobody should trust. All priced, so
 * the tail widens the model list without moving coverage.
 */
export const COST_LONG_TAIL_MODELS: readonly ModelConfig[] = [
  model({
    provider: "openai",
    model: "gpt-5.2",
    costInPerMToken: 1.75,
    costOutPerMToken: 14,
    cacheReadPerMToken: 0.175,
  }),
  model({ provider: "openai", model: "gpt-5.5", costInPerMToken: 5, costOutPerMToken: 30, cacheReadPerMToken: 0.5 }),
  model({
    provider: "openai",
    model: "gpt-5.1",
    costInPerMToken: 1.25,
    costOutPerMToken: 10,
    cacheReadPerMToken: 0.125,
  }),
  model({
    provider: "openai",
    model: "gpt-5.4-nano",
    costInPerMToken: 0.2,
    costOutPerMToken: 1.25,
    cacheReadPerMToken: 0.02,
  }),
  model({ provider: "openai", model: "gpt-5-pro", costInPerMToken: 15, costOutPerMToken: 120 }),
  model({
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    costInPerMToken: 3,
    costOutPerMToken: 15,
    cacheReadPerMToken: 0.3,
    cacheWritePerMToken: 3.75,
  }),
  model({
    provider: "google",
    model: "gemini-2.5-pro",
    costInPerMToken: 1.25,
    costOutPerMToken: 10,
    cacheReadPerMToken: 0.125,
  }),
  model({ provider: "mistral", model: "mistral-large-latest", costInPerMToken: 0.5, costOutPerMToken: 1.5 }),
]

/**
 * Genuinely free, and priced that way in the registry — which is the whole point
 * of archetype F: a $0 total with 100% priced coverage and no warnings, so "free"
 * is visibly not the same reading as "unpriced".
 */
export const FREE_MODELS: readonly ModelConfig[] = [
  model({
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    costInPerMToken: 0,
    costOutPerMToken: 0,
  }),
  model({
    provider: "openrouter",
    model: "nvidia/nemotron-nano-9b-v2:free",
    costInPerMToken: 0,
    costOutPerMToken: 0,
  }),
]

/**
 * A model the registry has never heard of, served by a provider it has never heard
 * of either — the only shape that produces `unpriced` rather than a neighbour's
 * price. Tokens move, no dollars are recorded, and coverage reads "at least N%".
 */
export const UNPRICED_GATEWAY_MODEL = model({
  provider: "acme-gateway",
  model: "acme-router-v3",
  costInPerMToken: 0,
  costOutPerMToken: 0,
})
