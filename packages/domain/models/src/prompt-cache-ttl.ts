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

/**
 * Only what the provider states in writing. Where a provider documents a range, the
 * conservative end is used: understating a lifetime understates the ceiling, which
 * costs a finding, while overstating it invents headroom nobody can reach.
 *
 * Opt-in longer lifetimes are the known limitation of the whole approach: Anthropic's
 * `ttl: "1h"`, OpenAI's `prompt_cache_options.ttl` and Gemini's explicit-cache `ttl`
 * all raise a customer's real ceiling above what this table reports, and a table
 * cannot see any of them.
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
  {
    // "A cached prefix remains eligible for reuse for at least 30 minutes"; the
    // `prompt_cache_options.ttl` default is `30m`. Only the families that document
    // this — a newer OpenAI model falls through to unknown rather than inheriting.
    provider: "openai",
    modelPrefix: "gpt-5.6",
    ttlSeconds: 30 * MINUTE,
    source: "https://developers.openai.com/api/docs/guides/prompt-caching",
  },
  {
    // "cached prefixes generally remain active for 5 to 10 minutes of inactivity, up
    // to a maximum of one hour" — the low end of the documented range.
    provider: "openai",
    modelPrefix: "gpt-5",
    ttlSeconds: 5 * MINUTE,
    source: "https://developers.openai.com/api/docs/guides/prompt-caching",
  },
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
