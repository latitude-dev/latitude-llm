import type { SpanTokenCounts } from "../../../entities/span.ts"
import type { OtlpKeyValue } from "../../types.ts"
import { first, firstKeyed, fromInt, keyedFromInt } from "../utils.ts"

// ─── Token attribute candidates ──────────────────────────

const inputKeyedCandidates = [
  keyedFromInt("gen_ai.usage.input_tokens"),
  keyedFromInt("gen_ai.usage.prompt_tokens"),
  keyedFromInt("llm.token_count.prompt"),
  keyedFromInt("ai.usage.promptTokens"),
  keyedFromInt("ai.usage.inputTokens"),
  keyedFromInt("input_tokens"), // Claude Code (additive: non-cached input only)
]

const cacheReadCandidates = [
  fromInt("gen_ai.usage.cache_read.input_tokens"),
  fromInt("gen_ai.usage.cache_read_input_tokens"),
  fromInt("ai.usage.cachedInputTokens"),
  fromInt("ai.usage.inputTokenDetails.cacheReadTokens"),
  fromInt("llm.token_count.prompt_details.cache_read"),
  fromInt("cache_read_tokens"), // Claude Code
]

const cacheCreateCandidates = [
  fromInt("gen_ai.usage.cache_creation.input_tokens"),
  fromInt("gen_ai.usage.cache_creation_input_tokens"), // Anthropic-style OTel exporters (and openclaw-telemetry)
  fromInt("llm.token_count.prompt_details.cache_write"),
  fromInt("ai.usage.inputTokenDetails.cacheWriteTokens"),
  fromInt("cache_creation_tokens"), // Claude Code
]

const outputCandidates = [
  fromInt("gen_ai.usage.output_tokens"),
  fromInt("gen_ai.usage.completion_tokens"),
  fromInt("llm.token_count.completion"),
  fromInt("ai.usage.completionTokens"),
  fromInt("ai.usage.outputTokens"),
  fromInt("output_tokens"), // Claude Code
]

const reasoningCandidates = [
  fromInt("gen_ai.usage.reasoning_tokens"),
  fromInt("llm.token_count.completion_details.reasoning"),
  fromInt("ai.usage.outputTokenDetails.reasoningTokens"),
]

const totalCandidates = [
  fromInt("llm.token_count.total"),
  fromInt("llm.usage.total_tokens"),
  fromInt("gen_ai.usage.total_tokens"),
  fromInt("ai.usage.totalTokens"),
]

// ─── Inclusive vs additive detection ─────────────────────
//
// LLM APIs report token counts in two incompatible ways:
//
//   INCLUSIVE: the top-level count already contains the
//   sub-categories as subsets. To get the "plain" portion,
//   subtract the sub-categories from the total.
//     input_tokens = 10000  (includes 8000 cached)
//     → non-cached = 10000 - 8000 = 2000
//
//   ADDITIVE: the top-level count only covers the "plain"
//   portion. Sub-categories are separate and must be summed
//   to get the true total.
//     input_tokens = 2000   (excludes cached)
//     → total = 2000 + 8000 = 10000
//
// This split affects BOTH sides of the token ledger:
//
//   Input:  sub-categories are cache_read + cache_create
//   Output: sub-category is reasoning tokens
//
// Detection uses four strategies, in priority order:
//
// 0. IMPOSSIBILITY CHECK (input only) — an inclusive count cannot
//    be smaller than the sub-categories it supposedly contains,
//    so rawInput < cache rules inclusive out outright.
//
// 1. TOTAL-BASED INFERENCE — when a rawTotal attribute exists,
//    we check which (inputModel × outputModel) arithmetic
//    formula reproduces it. This is a proof, not a heuristic.
//
// 2. CONVENTION-LEVEL — some attribute keys guarantee inclusive
//    semantics because the SDK normalized before emitting.
//
// 3. PROVIDER-LEVEL — for passthrough conventions (OpenInference,
//    OpenLLMetry), the raw API model determines it.

// ── Strategy 0: inclusive is arithmetically impossible ────
//
// Inclusive semantics mean rawInput contains the cache
// sub-categories, which forces rawInput >= cache. When an
// emitter reports less input than cache, no arithmetic makes
// the inclusive reading valid, so subtracting would clamp real
// uncached input to zero. Emitters that re-spell Anthropic's
// additive `input_tokens` under a normalized key (our own
// Claude Code telemetry among them) land here and would
// otherwise be misread as inclusive by strategy 2.
//
// This assumes rawInput covers both cache_read and
// cache_create or neither; an emitter that folds only
// cache_read into input is not representable either way.
function isInclusiveInputPossible(rawInput: number, cache: number): boolean {
  return rawInput >= cache
}

// ── Strategy 1: total-based arithmetic inference ──────────
//
// Four combinations of (inputModel × outputModel) each produce
// a different predicted total. We check which one matches:
//
//   inclusive × inclusive → total = rawInput + rawOutput
//   additive × inclusive → total = rawInput + cache + rawOutput
//   inclusive × additive → total = rawInput + rawOutput + reasoning
//   additive × additive → total = rawInput + cache + rawOutput + reasoning
//
// When a sub-category is zero, some formulas collapse and that
// side becomes ambiguous — but it also doesn't matter, since
// there's nothing to subtract on that side anyway.

interface InferredInclusivity {
  readonly input: boolean | null
  readonly output: boolean | null
}

function inferFromTotal(
  rawInput: number,
  rawOutput: number,
  cache: number,
  reasoning: number,
  rawTotal: number,
): InferredInclusivity | null {
  if (rawTotal <= 0) return null
  if (cache === 0 && reasoning === 0) return null

  interface Model {
    input: boolean
    output: boolean
  }

  const matches: Model[] = []

  if (rawInput + rawOutput === rawTotal) {
    matches.push({ input: true, output: true })
  }
  if (cache > 0 && rawInput + cache + rawOutput === rawTotal) {
    matches.push({ input: false, output: true })
  }
  if (reasoning > 0 && rawInput + rawOutput + reasoning === rawTotal) {
    matches.push({ input: true, output: false })
  }
  if (cache > 0 && reasoning > 0 && rawInput + cache + rawOutput + reasoning === rawTotal) {
    matches.push({ input: false, output: false })
  }

  if (matches.length === 0) return null

  // If all matching formulas agree on a side, that side is determined.
  // When they disagree (sub-category is 0 → formulas collapse), that
  // side is null and falls through to convention/provider detection.
  const inputs = new Set(matches.map((m) => m.input))
  const outputs = new Set(matches.map((m) => m.output))

  return {
    input: inputs.size === 1 ? [...inputs][0] : null,
    output: outputs.size === 1 ? [...outputs][0] : null,
  }
}

// ── Strategy 2: convention-level (input only) ─────────────

const ALWAYS_INCLUSIVE_INPUT_KEYS = new Set([
  "gen_ai.usage.input_tokens", // OTEL GenAI v1.37+
  "ai.usage.promptTokens", // Vercel AI SDK v5
  "ai.usage.inputTokens", // Vercel AI SDK v6+
])

// No output keys are known to always normalize reasoning.
// Vercel AI SDK passes through the provider's raw value.
// OTEL GenAI spec has no normalization guidance for reasoning.

// ── Strategy 3: provider-level ────────────────────────────

const ADDITIVE_INPUT_PROVIDERS = new Set(["anthropic", "aws.bedrock", "aws_bedrock", "bedrock", "amazon-bedrock"])

const ADDITIVE_OUTPUT_PROVIDERS = new Set(["gcp.vertex_ai", "vertexai"])

function matchesProviderSet(provider: string, set: Set<string>): boolean {
  const p = provider.toLowerCase()
  if (set.has(p)) return true
  return set.has(p.split(".")[0])
}

// ── Combined fallback: strategies 2+3 ─────────────────────

function isInputInclusiveFallback(matchedKey: string | undefined, provider: string): boolean {
  if (matchedKey !== undefined && ALWAYS_INCLUSIVE_INPUT_KEYS.has(matchedKey)) return true
  return !matchesProviderSet(provider, ADDITIVE_INPUT_PROVIDERS)
}

function isOutputInclusiveFallback(provider: string): boolean {
  return !matchesProviderSet(provider, ADDITIVE_OUTPUT_PROVIDERS)
}

// ─── Normalize to additive ───────────────────────────────

function toAdditive(raw: number, subCategories: number, inclusive: boolean): number {
  if (!inclusive || subCategories === 0) return raw
  return Math.max(0, raw - subCategories)
}

// ─── Resolve ─────────────────────────────────────────────

export function resolveTokens(attrs: readonly OtlpKeyValue[], provider: string): SpanTokenCounts {
  const rawInputMatch = firstKeyed(inputKeyedCandidates, attrs)
  const rawInput = rawInputMatch?.value ?? 0
  const rawOutput = first(outputCandidates, attrs) ?? 0
  const cacheRead = first(cacheReadCandidates, attrs) ?? 0
  const cacheCreate = first(cacheCreateCandidates, attrs) ?? 0
  const reasoning = first(reasoningCandidates, attrs) ?? 0
  const rawTotal = first(totalCandidates, attrs)

  const cache = cacheRead + cacheCreate

  // Strategy 1: infer from rawTotal arithmetic
  const inferred = rawTotal ? inferFromTotal(rawInput, rawOutput, cache, reasoning, rawTotal) : null

  // Strategy 2+3: convention/provider fallback for anything strategy 1 couldn't determine
  const inputInclusive =
    cache > 0 && !isInclusiveInputPossible(rawInput, cache)
      ? false
      : (inferred?.input ?? isInputInclusiveFallback(rawInputMatch?.key, provider))
  const outputInclusive = inferred?.output ?? isOutputInclusiveFallback(provider)

  return {
    tokensInput: toAdditive(rawInput, cache, inputInclusive),
    tokensOutput: toAdditive(rawOutput, reasoning, outputInclusive),
    tokensCacheRead: cacheRead,
    tokensCacheCreate: cacheCreate,
    tokensReasoning: reasoning,
  }
}
