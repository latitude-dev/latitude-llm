import type { ModelConfig } from "@domain/shared/seeding"

/**
 * Model identities only. Every rate a cohort is costed at comes from the
 * `@domain/models` registry at span-build time, so a fixture cannot state a price
 * the dashboard's own break-even disagrees with — the two read the same row.
 *
 * What matters when picking a pair is therefore its *shape* in the registry:
 * whether it has a cache-write premium (break-even 21.7%), only a cache-read rate
 * (break-even 0%), a rate of zero (free), or no entry at all (unpriced).
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
export const CLAUDE_OPUS_4_5 = model({ provider: "anthropic", model: "claude-opus-4-5" })
export const CLAUDE_HAIKU_4_5 = model({ provider: "anthropic", model: "claude-haiku-4-5" })
export const CLAUDE_OPUS_4_1 = model({ provider: "anthropic", model: "claude-opus-4-1" })
export const CLAUDE_OPUS_4_6 = model({ provider: "anthropic", model: "claude-opus-4-6" })
/**
 * The only family still on a five-minute cache by default, which is what a `Stop caching`
 * cohort needs: OpenAI keeps its listed models for a full day at no extra cost, so calls
 * spaced an hour apart are warm there and there is nothing to stop.
 */
export const CLAUDE_OPUS_4_7 = model({ provider: "anthropic", model: "claude-opus-4-7" })

/** No cache-write price at all, so break-even collapses to 0%. */
export const GPT_5_MINI = model({ provider: "openai", model: "gpt-5-mini" })
export const GPT_5_NANO = model({ provider: "openai", model: "gpt-5-nano" })
export const GPT_5_4_MINI = model({ provider: "openai", model: "gpt-5.4-mini" })
export const GPT_5_4 = model({ provider: "openai", model: "gpt-5.4" })

/**
 * OpenAI *with* a write premium, so break-even is 21.7% where `gpt-5.4-mini` on the same
 * provider is 0%. Also the family OpenAI holds for a day under extended retention, where
 * the mini and nano variants keep the five-to-ten-minute in-memory policy — which is what
 * lets a cohort on it show the assumed lifetime deciding a verdict.
 */
export const GPT_5_6_LUNA = model({ provider: "openai", model: "gpt-5.6-luna" })

export const GEMINI_2_5_FLASH = model({ provider: "google", model: "gemini-2.5-flash" })
export const GEMINI_2_5_FLASH_LITE = model({ provider: "google", model: "gemini-2.5-flash-lite" })

/**
 * One-off models for the unhealthy archetype's long tail: enough distinct rows that
 * top-N + `Other models` has something to collapse, and thin enough that the
 * breakdown table's per-row averages are samples nobody should trust. All priced, so
 * the tail widens the model list without moving coverage.
 */
export const COST_LONG_TAIL_MODELS: readonly ModelConfig[] = [
  model({ provider: "openai", model: "gpt-5.2" }),
  model({ provider: "openai", model: "gpt-5.5" }),
  model({ provider: "openai", model: "gpt-5.1" }),
  model({ provider: "openai", model: "gpt-5.4-nano" }),
  model({ provider: "openai", model: "gpt-5-pro" }),
  model({ provider: "anthropic", model: "claude-sonnet-4-5" }),
  model({ provider: "google", model: "gemini-2.5-pro" }),
  model({ provider: "mistral", model: "mistral-large-latest" }),
]

/**
 * Priced at zero in the registry, which is the whole point of archetype F: a $0
 * total with 100% priced coverage and no warnings, so "free" is visibly not the
 * same reading as "unpriced".
 */
export const FREE_MODELS: readonly ModelConfig[] = [
  model({ provider: "openrouter", model: "google/gemma-4-31b-it:free" }),
  model({ provider: "openrouter", model: "nvidia/nemotron-nano-9b-v2:free" }),
]

/**
 * A model the registry has never heard of, served by a provider it has never heard
 * of either — the only shape that produces `unpriced` rather than being priced as
 * some neighbour. The span builder derives that from the failed lookup, so nothing
 * here has to assert it.
 */
export const UNPRICED_GATEWAY_MODEL = model({ provider: "acme-gateway", model: "acme-router-v3" })
