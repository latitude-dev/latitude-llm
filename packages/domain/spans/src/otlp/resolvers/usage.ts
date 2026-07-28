import { computeTokenCost, getCostSpec } from "@domain/models"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import { resolveTokens } from "./usage/tokens.ts"
import { first, fromFloat } from "./utils.ts"

const MICROCENTS_PER_USD = 100_000_000

function usdToMicrocents(v: number): number {
  return Math.round(v * MICROCENTS_PER_USD)
}

const costInputCandidates = [
  fromFloat("gen_ai.usage.input_cost", usdToMicrocents),
  fromFloat("llm.cost.prompt", usdToMicrocents),
]

const costOutputCandidates = [
  fromFloat("gen_ai.usage.output_cost", usdToMicrocents),
  fromFloat("llm.cost.completion", usdToMicrocents),
]

const costTotalCandidates = [
  fromFloat("gen_ai.usage.total_cost", (v) => (v ? usdToMicrocents(v) : undefined)),
  fromFloat("gen_ai.usage.cost", (v) => (v ? usdToMicrocents(v) : undefined)),
  fromFloat("llm.cost.total", (v) => (v ? usdToMicrocents(v) : undefined)),
]

// ─── Resolve ─────────────────────────────────────────────

type CostEstimation =
  | { readonly kind: "estimated"; readonly input: number; readonly output: number }
  | { readonly kind: "unpriced" }
  | { readonly kind: "noTokens" }

function estimateCostFromTokens({
  provider,
  model,
  tokensInput,
  tokensOutput,
  tokensCacheRead,
  tokensCacheCreate,
  tokensReasoning,
}: {
  provider: string
  model: string
  tokensInput: number
  tokensOutput: number
  tokensCacheRead: number
  tokensCacheCreate: number
  tokensReasoning: number
}): CostEstimation {
  if (tokensInput + tokensOutput + tokensCacheRead + tokensCacheCreate + tokensReasoning === 0) {
    return { kind: "noTokens" }
  }

  const { cost, costImplemented } = getCostSpec(provider, model)
  if (!costImplemented) return { kind: "unpriced" }

  const inputUsd =
    computeTokenCost(cost, tokensInput, "input") +
    computeTokenCost(cost, tokensCacheRead, "cacheRead") +
    computeTokenCost(cost, tokensCacheCreate, "cacheWrite")

  const outputUsd =
    computeTokenCost(cost, tokensOutput, "output") + computeTokenCost(cost, tokensReasoning, "reasoning")

  return {
    kind: "estimated",
    input: Math.round(inputUsd * MICROCENTS_PER_USD),
    output: Math.round(outputUsd * MICROCENTS_PER_USD),
  }
}

export interface ResolvedUsage {
  /** Non-cached input tokens (additive: total_input = tokensInput + tokensCacheRead + tokensCacheCreate) */
  readonly tokensInput: number
  /** Non-reasoning output tokens (additive: total_output = tokensOutput + tokensReasoning) */
  readonly tokensOutput: number
  /** Tokens served from provider cache (subset of total input) */
  readonly tokensCacheRead: number
  /** Tokens written to provider cache (subset of total input) */
  readonly tokensCacheCreate: number
  /** Reasoning/thinking tokens (subset of total output) */
  readonly tokensReasoning: number
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly costIsEstimated: boolean
  /** Tokens were reported but no models.dev pricing matched provider/model, so cost stayed 0. */
  readonly costPricingMissing: boolean
}

// ─── OpenClaw embedded usage ──────────────────────────────
//
// OpenClaw's diagnostics-otel plugin never emits flat gen_ai.usage.* attrs. It
// buries per-call usage — and the provider's real cost (USD) — inside the
// assistant message JSON on `openclaw.content.output_messages`:
//
//   [{ role, content, usage: { input, output, cacheRead, cacheWrite,
//        reasoningTokens, totalTokens, cost: { input, output, total, … } } }]
//
// `input` is ADDITIVE (excludes cache), matching ResolvedUsage's contract, so
// fields map straight across with no inclusive/additive inference. The same
// totals also ride on a standalone `openclaw.model.usage` span the plugin emits
// in its own orphan trace (dropped at ingest, see otlp/dropped-spans.ts) — this
// per-call copy lives on the model.call span inside the run trace.

interface OpenclawCost {
  readonly input?: unknown
  readonly output?: unknown
  readonly cacheRead?: unknown
  readonly cacheWrite?: unknown
  readonly total?: unknown
}

interface OpenclawUsage {
  readonly input?: unknown
  readonly output?: unknown
  readonly cacheRead?: unknown
  readonly cacheWrite?: unknown
  readonly reasoningTokens?: unknown
  readonly cost?: OpenclawCost
}

function nonNegative(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0
}

function extractEmbeddedUsage(outputMessagesJson: string): OpenclawUsage | undefined {
  try {
    const parsed: unknown = JSON.parse(outputMessagesJson)
    if (!Array.isArray(parsed)) return undefined
    const withUsage = parsed.find((m): m is { usage: OpenclawUsage } => {
      if (!m || typeof m !== "object") return false
      const usage = (m as { usage?: unknown }).usage
      return usage !== null && typeof usage === "object"
    })
    return withUsage?.usage
  } catch {
    return undefined
  }
}

function resolveEmbeddedMessageUsage(
  attrs: readonly OtlpKeyValue[],
  provider: string,
  model: string,
): ResolvedUsage | null {
  const raw = stringAttr(attrs, "openclaw.content.output_messages")
  if (!raw) return null
  const usage = extractEmbeddedUsage(raw)
  if (!usage) return null

  const tokensInput = nonNegative(usage.input)
  const tokensOutput = nonNegative(usage.output)
  const tokensCacheRead = nonNegative(usage.cacheRead)
  const tokensCacheCreate = nonNegative(usage.cacheWrite)
  const tokensReasoning = nonNegative(usage.reasoningTokens)
  if (tokensInput + tokensOutput + tokensCacheRead + tokensCacheCreate + tokensReasoning === 0) return null

  const tokens = { tokensInput, tokensOutput, tokensCacheRead, tokensCacheCreate, tokensReasoning }
  const cost = usage.cost && typeof usage.cost === "object" ? usage.cost : undefined

  if (cost && typeof cost.total === "number") {
    // Provider-supplied cost (USD) — fold cache costs into the input side so
    // input + output == total, keeping the provider's authoritative total.
    return {
      ...tokens,
      costInputMicrocents: usdToMicrocents(
        nonNegative(cost.input) + nonNegative(cost.cacheRead) + nonNegative(cost.cacheWrite),
      ),
      costOutputMicrocents: usdToMicrocents(nonNegative(cost.output)),
      costTotalMicrocents: usdToMicrocents(nonNegative(cost.total)),
      costIsEstimated: false,
      costPricingMissing: false,
    }
  }

  // No embedded cost — estimate from the tokens, same as flat-attr spans.
  const estimation = estimateCostFromTokens({ provider, model, ...tokens })
  const costInputMicrocents = estimation.kind === "estimated" ? estimation.input : 0
  const costOutputMicrocents = estimation.kind === "estimated" ? estimation.output : 0
  return {
    ...tokens,
    costInputMicrocents,
    costOutputMicrocents,
    costTotalMicrocents: costInputMicrocents + costOutputMicrocents,
    costIsEstimated: estimation.kind === "estimated",
    costPricingMissing: estimation.kind === "unpriced",
  }
}

interface ResolveUsageInput {
  readonly attrs: readonly OtlpKeyValue[]
  readonly provider: string
  readonly model: string
}

export function resolveUsage({ attrs, provider, model }: ResolveUsageInput): ResolvedUsage {
  // Some instrumentations carry usage in the message payload rather than as flat
  // gen_ai.usage.* attrs (OpenClaw) — prefer that when present.
  const embedded = resolveEmbeddedMessageUsage(attrs, provider, model)
  if (embedded) return embedded

  const {
    input: tokensInput,
    output: tokensOutput,
    cacheRead: tokensCacheRead,
    cacheCreate: tokensCacheCreate,
    reasoning: tokensReasoning,
  } = resolveTokens(attrs, provider)

  // ── Cost ──
  const attrCostInput = first(costInputCandidates, attrs)
  const attrCostOutput = first(costOutputCandidates, attrs)
  const attrCostTotal = first(costTotalCandidates, attrs)

  const hasAttrCosts = attrCostInput !== undefined && attrCostOutput !== undefined
  const hasAnyAttrCost = attrCostInput !== undefined || attrCostOutput !== undefined || attrCostTotal !== undefined

  const costEstimation = hasAttrCosts
    ? undefined
    : estimateCostFromTokens({
        provider,
        model,
        tokensInput,
        tokensOutput,
        tokensCacheRead,
        tokensCacheCreate,
        tokensReasoning,
      })

  const estimated = costEstimation?.kind === "estimated" ? costEstimation : undefined
  const costIsEstimated = estimated !== undefined
  const costInput = attrCostInput ?? estimated?.input ?? 0
  const costOutput = attrCostOutput ?? estimated?.output ?? 0
  const costTotal = attrCostTotal ?? (costInput + costOutput > 0 ? costInput + costOutput : 0)

  return {
    tokensInput,
    tokensOutput,
    tokensCacheRead,
    tokensCacheCreate,
    tokensReasoning,
    costInputMicrocents: costInput,
    costOutputMicrocents: costOutput,
    costTotalMicrocents: costTotal,
    costIsEstimated,
    // Any provider-supplied cost counts as priced even when the model is unknown to models.dev.
    // Checking only the total would report a span carrying a real one-sided cost as unpriced.
    costPricingMissing: costEstimation?.kind === "unpriced" && !hasAnyAttrCost,
  }
}
