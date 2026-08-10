/**
 * How long a provider keeps a written prompt-cache entry alive.
 *
 * This is what turns a gap between two calls into either a hit or a fresh miss, so
 * it is the one input the achievable ceiling cannot be computed without. models.dev
 * carries cache read/write *prices* but no lifetime, so this table is hand-written
 * from provider documentation and every entry cites the page it came from.
 *
 * Keyed by model, not only by provider: Bedrock documents Claude at five minutes and
 * GPT-5.6 at thirty in the same table, so a per-provider value would be wrong for one
 * of them by construction.
 *
 * There is deliberately **no fallback**. An unlisted pair returns null, which reads
 * downstream as an unknown ceiling — and `classifyCacheState` already answers that
 * case by only returning verdicts that hold for every possible ceiling. Guessing a
 * lifetime instead would put a confident number, and a recommendation drawn from it,
 * on traffic we know nothing about.
 *
 * Browser-safe: a static table with no runtime dependencies, like the provider
 * aliases beside it.
 */

import { resolveProviderName } from "./provider-aliases.ts"

const MINUTE = 60
const HOUR = 60 * MINUTE

/**
 * One documented lifetime. `modelPrefix` matches the start of the model id, so a
 * dated or regional variant inherits its family's entry; rules are evaluated in
 * order, so a longer prefix must come before the shorter one it extends.
 */
interface PromptCacheTtlRule {
  /** Canonical models.dev provider id. */
  readonly provider: string
  readonly modelPrefix: string
  readonly ttlSeconds: number
  readonly source: string
}

const OPENAI_PROMPT_CACHING_DOCS = "https://developers.openai.com/api/docs/guides/prompt-caching"

/**
 * The families OpenAI lists under extended prompt cache retention: "Extended prompt cache
 * retention keeps cached prefixes active for longer, up to a maximum of 24 hours", at the
 * same price, and since 29 May 2026 it is the *default* rather than an opt-in.
 *
 * `gpt-5.6` is here even though the guide's list stops at `gpt-5.5-pro`: for 5.5 and later
 * there is no `in_memory` option to fall back to, so the list only enumerates the models
 * where the choice still exists.
 *
 * The one case this overstates is an organization with Zero Data Retention, which "default
 * to `in_memory` when `prompt_cache_retention` is not specified" — nothing in a span says
 * whether ZDR is on, and erring the other way would hand a `stopCaching` to everyone else.
 */
const OPENAI_EXTENDED_RETENTION_PREFIXES = [
  "gpt-5.6",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5-codex",
  "gpt-5",
  "gpt-4.1",
] as const

/**
 * OpenAI models the extended-retention list leaves out, which keeps the in-memory policy:
 * "cached prefixes generally remain active for 5 to 10 minutes of inactivity, up to a
 * maximum of one hour" — the low end of that range.
 *
 * These must be evaluated before the list above, or `gpt-5.4-mini` inherits `gpt-5.4`.
 */
const OPENAI_IN_MEMORY_PREFIXES = ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5-mini", "gpt-5-nano", "gpt-5-pro"] as const

/**
 * Only what the provider states in writing. Where a provider documents a range, the
 * conservative end is used: understating a lifetime understates the ceiling, which
 * costs a finding, while overstating it invents headroom nobody can reach.
 *
 * Conservative on the lifetime is not the same as conservative on the advice, and the
 * difference is why `stopCaching` is gated on a measured cost comparison rather than on
 * the ceiling alone. A lifetime read too short produces a low ceiling, and a low ceiling
 * is what turns "you are overpaying" into "stop caching" — the one recommendation here
 * that costs money if it is wrong.
 *
 * Opt-in longer lifetimes are the known limitation of the whole approach: Anthropic's
 * `ttl: "1h"` and Gemini's explicit-cache `ttl` both raise a customer's real ceiling
 * above what this table reports, and a table cannot see either. Both also charge for the
 * privilege — Anthropic writes at 2x base for an hour against 1.25x for five minutes,
 * Gemini bills explicit cache storage by the hour — and neither premium is in the
 * registry, so a longer lifetime makes the modeled savings optimistic as well as the
 * ceiling. OpenAI's extended retention is the exception: same price, so its 24 hours are
 * free to assume.
 *
 * Anthropic's is in fact observable — the Vercel AI SDK forwards Anthropic's
 * `cache_creation` 5m/1h split inside the JSON value of `ai.response.providerMetadata`
 * — but the usage resolver reads only the summed scalar, so nothing downstream can use
 * it yet. Measured share and the reasons capturing it is non-trivial are in
 * `dev-docs/prompt-cache-ttl-detection.md`. Until that is wired up, an agent buying a
 * 1-hour lifetime is measured against this table's 5 minutes and its ceiling is
 * understated.
 *
 * Gemini is absent on purpose, and is the entry most likely to be argued about.
 * Google does publish a number: implicit caching is on by default for 2.5 and newer,
 * and the zero-data-retention page says that data "is strictly in RAM (not at-rest),
 * isolated at the project level, and has a 24-hour TTL"
 * (https://ai.google.dev/gemini-api/docs/zdr). But that bounds how long RAM may hold
 * an entry, not how long a read can count on finding one — the implicit-caching
 * announcement only ever says a matching prefix is "eligible for a cache hit" and
 * that a stable prefix "increase[s] the chance" of one
 * (https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/).
 * Twenty-four hours would mark anything called more than daily as fully reachable and
 * turn nearly every Gemini row into a finding whose headroom depends on someone
 * else's memory pressure. A best-effort cache has no "configured perfectly", so there
 * is no ceiling to claim. Revisit if Google publishes a guaranteed minimum, or read
 * the explicit Cache API's own TTL for traffic we can tell is using it.
 */
const PROMPT_CACHE_TTL_RULES: readonly PromptCacheTtlRule[] = [
  {
    // "By default, the cache has a 5-minute lifetime. The cache is refreshed for no
    // additional cost each time the cached content is used." The refresh-on-use half
    // is what makes a gap-to-predecessor measurement the right one.
    provider: "anthropic",
    modelPrefix: "claude",
    ttlSeconds: 5 * MINUTE,
    source: "https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching",
  },
  ...OPENAI_IN_MEMORY_PREFIXES.map((modelPrefix) => ({
    provider: "openai",
    modelPrefix,
    ttlSeconds: 5 * MINUTE,
    source: OPENAI_PROMPT_CACHING_DOCS,
  })),
  ...OPENAI_EXTENDED_RETENTION_PREFIXES.map((modelPrefix) => ({
    provider: "openai",
    modelPrefix,
    ttlSeconds: 24 * HOUR,
    source: OPENAI_PROMPT_CACHING_DOCS,
  })),
  {
    // Bedrock hosts both families and documents them apart: the model table lists
    // Claude at "5 minutes" and GPT-5.6 Sol/Terra/Luna at "30 minutes". Same TTL
    // reset-on-hit semantics as Anthropic direct.
    provider: "amazon-bedrock",
    modelPrefix: "openai.gpt-5.6",
    ttlSeconds: 30 * MINUTE,
    source: "https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html",
  },
  {
    provider: "amazon-bedrock",
    modelPrefix: "anthropic.claude",
    ttlSeconds: 5 * MINUTE,
    source: "https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html",
  },
]

/**
 * The documented cache lifetime for a provider/model pair, or null when no provider
 * documentation covers it.
 *
 * Null is a real answer, not a failure: DeepSeek, for one, documents no lifetime at
 * all — its cache is "automatically cleared, usually within a few hours to a few
 * days", which is a garbage-collection policy rather than a window a gap can be
 * compared against.
 */
export function promptCacheTtlSeconds({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): number | null {
  const canonicalProvider = resolveProviderName(provider)
  const modelId = model.toLowerCase()
  const rule = PROMPT_CACHE_TTL_RULES.find(
    (candidate) => candidate.provider === canonicalProvider && modelId.startsWith(candidate.modelPrefix),
  )
  return rule?.ttlSeconds ?? null
}

/** The documentation behind a pair's lifetime, so a figure on screen can be traced. */
export function promptCacheTtlSource({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): string | null {
  const canonicalProvider = resolveProviderName(provider)
  const modelId = model.toLowerCase()
  const rule = PROMPT_CACHE_TTL_RULES.find(
    (candidate) => candidate.provider === canonicalProvider && modelId.startsWith(candidate.modelPrefix),
  )
  return rule?.source ?? null
}

/**
 * Every lifetime any rule can resolve to, ascending. A query measuring cadence
 * against a TTL needs the whole set up front so it can evaluate each in one pass
 * instead of one round trip per provider.
 */
export const PROMPT_CACHE_TTL_SECONDS_OPTIONS: readonly number[] = [
  ...new Set(PROMPT_CACHE_TTL_RULES.map((rule) => rule.ttlSeconds)),
].sort((a, b) => a - b)
