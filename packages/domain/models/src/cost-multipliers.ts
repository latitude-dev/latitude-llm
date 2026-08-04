/**
 * The pricing modifiers a provider reports in its response `usage` object and that no token
 * count can express: which speed tier served the request, where inference ran, and how long
 * each cache write was bought for.
 *
 * Pricing from tokens alone is only correct when every token of a category bills at one rate.
 * Anthropic breaks that in three ways at once — a 1-hour cache write bills at 2x base input
 * against 1.25x for the 5-minute default, fast mode doubles both sides, and US-only inference
 * adds 10% to every category — and the error is one-directional, always an undercount.
 *
 * Every factor here defaults to **1.0 when the modifier is absent**, which is what makes this
 * backward compatible structurally rather than by special-casing: a span carrying none of these
 * fields, and an exporter that will never emit them, price exactly as they did before this
 * module existed, with no backfill.
 *
 * models.dev carries none of it. The complete set of cost keys in the snapshot is `input,
 * output, cache_read, cache_write, tiers, context_over_200k, reasoning, input_audio,
 * output_audio` — no speed, tier, or TTL key — and fast mode is not a separate model id to look
 * up. So this is a hand-written table citing its sources, the same shape and for the same reason
 * as `prompt-cache-ttl.ts` beside it.
 *
 * Browser-safe: static tables with no runtime dependencies.
 */

import { computeTokenCost, type ModelCostSpec } from "./entities/cost.ts"
import { resolveProviderName } from "./provider-aliases.ts"

const ANTHROPIC_PRICING_DOCS = "https://platform.claude.com/docs/en/about-claude/pricing"
const ANTHROPIC_PROMPT_CACHING_DOCS = "https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching"
const OPENAI_BATCH_DOCS = "https://developers.openai.com/api/docs/guides/batch"

/**
 * How a request was served, normalized across providers. The cross-provider axis is the service
 * tier, so Anthropic's `usage.speed` (`fast` | `standard`) and OpenAI's `service_tier`
 * (`auto` | `default` | `flex` | `priority`) land on one field rather than on a per-provider
 * `fast_mode` boolean that the next provider's tier would not fit.
 */
export const SERVICE_TIERS = ["standard", "fast", "priority", "flex", "batch"] as const
export type ServiceTier = (typeof SERVICE_TIERS)[number]

const SERVICE_TIER_SET: ReadonlySet<string> = new Set(SERVICE_TIERS)

/**
 * Provider spellings that mean "the ordinary tier". OpenAI's `auto` names a routing *choice*
 * rather than an outcome, but the response echoes the tier that served the request, so a
 * response-side `auto` is the default tier.
 */
const SERVICE_TIER_ALIASES: Readonly<Record<string, ServiceTier>> = {
  default: "standard",
  auto: "standard",
  scale: "priority",
}

/** The normalized tier for a raw provider value, or null when it is not a tier we recognize. */
export function parseServiceTier(raw: string): ServiceTier | null {
  const value = raw.trim().toLowerCase()
  if (value === "") return null
  if (SERVICE_TIER_SET.has(value)) return value as ServiceTier
  return SERVICE_TIER_ALIASES[value] ?? null
}

/** Where inference ran. `us` is a premium; `global` is the standard rate. */
export const INFERENCE_GEOS = ["global", "us"] as const
export type InferenceGeo = (typeof INFERENCE_GEOS)[number]

const INFERENCE_GEO_SET: ReadonlySet<string> = new Set(INFERENCE_GEOS)

export function parseInferenceGeo(raw: string): InferenceGeo | null {
  const value = raw.trim().toLowerCase()
  return INFERENCE_GEO_SET.has(value) ? (value as InferenceGeo) : null
}

interface ServiceTierRule {
  /** Canonical models.dev provider id. */
  readonly provider: string
  /** Matches the start of the model id; empty matches every model of the provider. */
  readonly modelPrefix: string
  readonly tier: ServiceTier
  readonly multiplier: number
  readonly source: string
}

/**
 * Only tiers whose multiplier a provider states in writing, and only the ones that are a plain
 * factor on the catalog rate.
 *
 * Anthropic's priority tier and OpenAI's `flex` / `priority` are deliberately absent: both are
 * real premiums, neither publishes a factor that holds across models, and an unlisted tier
 * prices at the catalog rate. That understates a priority request, which is the same failure
 * this module exists to fix — but a guessed factor would put a confident wrong number on every
 * span carrying the tier, and there is no way to tell afterwards which it was. Add a row when
 * the rate is sourced.
 */
const SERVICE_TIER_RULES: readonly ServiceTierRule[] = [
  {
    // Fast mode "bills at 2x the standard rate for both input and output". Claude API only —
    // not Bedrock, Google Cloud, or Foundry — and offered on Opus 5 and Opus 4.8 alone, so the
    // prefixes are the whole allowlist rather than a family match.
    provider: "anthropic",
    modelPrefix: "claude-opus-5",
    tier: "fast",
    multiplier: 2,
    source: ANTHROPIC_PRICING_DOCS,
  },
  {
    provider: "anthropic",
    modelPrefix: "claude-opus-4-8",
    tier: "fast",
    multiplier: 2,
    source: ANTHROPIC_PRICING_DOCS,
  },
  {
    provider: "anthropic",
    modelPrefix: "claude",
    tier: "batch",
    multiplier: 0.5,
    source: ANTHROPIC_PRICING_DOCS,
  },
  {
    provider: "openai",
    modelPrefix: "",
    tier: "batch",
    multiplier: 0.5,
    source: OPENAI_BATCH_DOCS,
  },
]

interface InferenceGeoRule {
  readonly provider: string
  readonly geo: InferenceGeo
  readonly multiplier: number
  readonly source: string
}

/**
 * US-only inference is 1.1x on every token category — input, output, cache writes, cache reads.
 *
 * There is no model-version gate here even though the option only exists on Claude 4.6 and
 * later. A model that cannot route this way never reports the field, so absence already gates
 * it, while a hand-maintained version list would silently omit each new family on the day it
 * ships and undercount it — reintroducing exactly the bug this module removes.
 *
 * It matters more than it looks: organizations that opted out of global routing were
 * auto-migrated to `default_inference_geo: "us"`, so a workspace can sit on the 1.1x rate with
 * nothing in the *request* saying so. `usage` is the only place it is observable.
 */
const INFERENCE_GEO_RULES: readonly InferenceGeoRule[] = [
  { provider: "anthropic", geo: "us", multiplier: 1.1, source: ANTHROPIC_PRICING_DOCS },
]

interface CacheWriteTtlRule {
  readonly provider: string
  readonly modelPrefix: string
  readonly ttlSeconds: number
  /** Factor on the **catalog** cache-write rate, not on base input. See below. */
  readonly multiplier: number
  readonly source: string
}

/**
 * The premium for buying a longer cache lifetime, keyed by duration in seconds.
 *
 * Keyed by seconds rather than by tier name on purpose: a `cache_1h` key would bake one
 * provider's one tier into every layer below it, while OpenAI's extended retention runs to 24
 * hours and Gemini takes an arbitrary TTL. `prompt-cache-ttl.ts` already speaks in `ttlSeconds`.
 *
 * The multiplier is relative to the **catalog's** cache-write rate, which for every provider we
 * price is the default-lifetime rate — models.dev's `cache_write` is 1.25x input on every
 * Anthropic row, matching the published 5-minute price exactly. So Anthropic's 1-hour write,
 * documented at 2x base input, is 2 / 1.25 = 1.6x the catalog rate, and that lands on the
 * published per-model dollar figure exactly ($6.25 -> $10, $2.50 -> $4, $12.50 -> $20,
 * $1.25 -> $2). Expressing it against base input instead would re-derive a number the catalog
 * already carries and would silently reprice the 5-minute majority.
 *
 * A TTL with no rule prices at the catalog rate. That is the deliberate reading of an unknown
 * lifetime, not a gap to fill with the nearest listed one.
 */
const CACHE_WRITE_TTL_RULES: readonly CacheWriteTtlRule[] = [
  {
    // "the cache has a 5-minute lifetime" by default, and this is the rate models.dev carries.
    provider: "anthropic",
    modelPrefix: "claude",
    ttlSeconds: 300,
    multiplier: 1,
    source: ANTHROPIC_PROMPT_CACHING_DOCS,
  },
  {
    provider: "anthropic",
    modelPrefix: "claude",
    ttlSeconds: 3600,
    multiplier: 1.6,
    source: ANTHROPIC_PROMPT_CACHING_DOCS,
  },
]

function matchesModel(rule: { provider: string; modelPrefix: string }, provider: string, model: string): boolean {
  return rule.provider === provider && model.startsWith(rule.modelPrefix)
}

/**
 * The factor a service tier applies to every rate for a provider/model pair. 1.0 for an absent,
 * unrecognized, or unsourced tier.
 */
export function serviceTierMultiplier({
  provider,
  model,
  serviceTier,
}: {
  readonly provider: string
  readonly model: string
  readonly serviceTier?: string | undefined
}): number {
  const tier = parseServiceTier(serviceTier ?? "")
  if (tier === null || tier === "standard") return 1

  const canonicalProvider = resolveProviderName(provider)
  const modelId = model.toLowerCase()
  const rule = SERVICE_TIER_RULES.find((r) => r.tier === tier && matchesModel(r, canonicalProvider, modelId))
  return rule?.multiplier ?? 1
}

/** The factor an inference region applies to every rate. 1.0 for an absent or standard region. */
export function inferenceGeoMultiplier({
  provider,
  inferenceGeo,
}: {
  readonly provider: string
  readonly inferenceGeo?: string | undefined
}): number {
  const geo = parseInferenceGeo(inferenceGeo ?? "")
  if (geo === null || geo === "global") return 1

  const canonicalProvider = resolveProviderName(provider)
  const rule = INFERENCE_GEO_RULES.find((r) => r.geo === geo && r.provider === canonicalProvider)
  return rule?.multiplier ?? 1
}

/**
 * The factor tokens written at `ttlSeconds` apply to the catalog cache-write rate. 1.0 for a
 * lifetime no provider documentation covers.
 */
export function cacheWriteTtlMultiplier({
  provider,
  model,
  ttlSeconds,
}: {
  readonly provider: string
  readonly model: string
  readonly ttlSeconds: number
}): number {
  const canonicalProvider = resolveProviderName(provider)
  const modelId = model.toLowerCase()
  const rule = CACHE_WRITE_TTL_RULES.find(
    (r) => r.ttlSeconds === ttlSeconds && matchesModel(r, canonicalProvider, modelId),
  )
  return rule?.multiplier ?? 1
}

/** The documentation behind a lifetime's premium, so a figure on screen can be traced. */
export function cacheWriteTtlSource({
  provider,
  model,
  ttlSeconds,
}: {
  readonly provider: string
  readonly model: string
  readonly ttlSeconds: number
}): string | null {
  const canonicalProvider = resolveProviderName(provider)
  const modelId = model.toLowerCase()
  const rule = CACHE_WRITE_TTL_RULES.find(
    (r) => r.ttlSeconds === ttlSeconds && matchesModel(r, canonicalProvider, modelId),
  )
  return rule?.source ?? null
}

/**
 * Every cache lifetime a pair can be *bought* at, ascending — the sibling of
 * `promptCacheTtlSeconds`, which answers the different question of what lifetime a write gets
 * by default. Empty when the provider sells no choice.
 */
export function purchasablePromptCacheTtlSeconds({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): readonly number[] {
  const canonicalProvider = resolveProviderName(provider)
  const modelId = model.toLowerCase()
  return [
    ...new Set(
      CACHE_WRITE_TTL_RULES.filter((r) => matchesModel(r, canonicalProvider, modelId)).map((r) => r.ttlSeconds),
    ),
  ].sort((a, b) => a - b)
}

/**
 * The pricing modifiers reported alongside a span's tokens. All optional — an exporter that
 * supplies none of them gets today's pricing.
 */
export interface UsageModifiers {
  /** Raw provider value; normalized by `parseServiceTier`. */
  readonly serviceTier?: string | undefined
  /** Raw provider value; normalized by `parseInferenceGeo`. */
  readonly inferenceGeo?: string | undefined
  /**
   * Cache-write tokens split by the lifetime they were bought at, keyed by seconds. A single
   * request may mix lifetimes — Anthropic requires 1h breakpoints to precede 5m ones — which is
   * why this is a per-span split and not one TTL label.
   */
  readonly cacheCreateTokensByTtlSeconds?: Readonly<Record<number, number>> | undefined
}

/**
 * The share-weighted factor for a span's cache writes.
 *
 * The split is applied as one factor on the whole category rather than by pricing each bucket
 * separately, so a tiered catalog entry stays correctly tiered: `computeTokenCost` is linear in
 * the rate but not in the token count, and slicing the count into buckets would run each slice
 * through the tier ladder from zero.
 *
 * Tokens the split does not account for bill at the catalog rate. When the split sums to *more*
 * than the reported total the split becomes the whole denominator, which is the right reading of
 * a report whose scalar and breakdown disagree.
 */
function cacheWriteTtlFactor({
  provider,
  model,
  cacheWriteTokens,
  byTtlSeconds,
}: {
  readonly provider: string
  readonly model: string
  readonly cacheWriteTokens: number
  readonly byTtlSeconds: Readonly<Record<number, number>> | undefined
}): number {
  if (!byTtlSeconds) return 1

  let splitTokens = 0
  let weighted = 0
  for (const [seconds, tokens] of Object.entries(byTtlSeconds)) {
    if (!(tokens > 0)) continue
    const ttlSeconds = Number(seconds)
    if (!Number.isFinite(ttlSeconds)) continue
    splitTokens += tokens
    weighted += tokens * cacheWriteTtlMultiplier({ provider, model, ttlSeconds })
  }
  if (splitTokens <= 0) return 1

  const unsplit = Math.max(0, cacheWriteTokens - splitTokens)
  return (weighted + unsplit) / (splitTokens + unsplit)
}

export interface ModifiedCostTokens {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly reasoning: number
}

export interface ModifiedCostEstimate {
  readonly inputUsd: number
  readonly outputUsd: number
}

/**
 * Price a span's tokens through the modifier chain:
 *
 * ```
 * effective_rate = catalog_rate
 *                x service_tier_multiplier  (1.0 standard | 2.0 Anthropic fast | 0.5 batch)
 *                x inference_geo_multiplier (1.0 global   | 1.1 us)
 *                x cache_write_ttl_factor   (1.0 default lifetime | 1.6 Anthropic 1h)
 * ```
 *
 * Tier and geo scale every category; the TTL factor only scales cache writes. They compose, and
 * in that order: fast mode replaces the base rate and the cache factors apply on top of it, so a
 * cache read on fast Opus 5 is 0.1 x $10, not 0.1 x $5.
 *
 * With no modifiers every factor is exactly 1.0 and the arithmetic reduces to the same sums in
 * the same order as pricing straight from the catalog, so existing spans are unaffected.
 */
export function estimateModifiedCost({
  cost,
  provider,
  model,
  tokens,
  modifiers,
}: {
  readonly cost: ModelCostSpec
  readonly provider: string
  readonly model: string
  readonly tokens: ModifiedCostTokens
  readonly modifiers?: UsageModifiers | undefined
}): ModifiedCostEstimate {
  const everyCategory =
    serviceTierMultiplier({ provider, model, serviceTier: modifiers?.serviceTier }) *
    inferenceGeoMultiplier({ provider, inferenceGeo: modifiers?.inferenceGeo })

  const cacheWriteUsd =
    computeTokenCost(cost, tokens.cacheWrite, "cacheWrite") *
    cacheWriteTtlFactor({
      provider,
      model,
      cacheWriteTokens: tokens.cacheWrite,
      byTtlSeconds: modifiers?.cacheCreateTokensByTtlSeconds,
    })

  const inputUsd =
    (computeTokenCost(cost, tokens.input, "input") +
      computeTokenCost(cost, tokens.cacheRead, "cacheRead") +
      cacheWriteUsd) *
    everyCategory

  const outputUsd =
    (computeTokenCost(cost, tokens.output, "output") + computeTokenCost(cost, tokens.reasoning, "reasoning")) *
    everyCategory

  return { inputUsd, outputUsd }
}
