import { computeTokenCost, getCostSpec } from "@domain/models"
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

interface EstimatedCost {
  readonly input: number
  readonly output: number
}

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
}): EstimatedCost | undefined {
  if (tokensInput + tokensOutput + tokensCacheRead + tokensCacheCreate + tokensReasoning === 0) return undefined

  const { cost, costImplemented } = getCostSpec(provider, model)
  if (!costImplemented) return undefined

  const inputUsd =
    computeTokenCost(cost, tokensInput, "input") +
    computeTokenCost(cost, tokensCacheRead, "cacheRead") +
    computeTokenCost(cost, tokensCacheCreate, "cacheWrite")

  const outputUsd =
    computeTokenCost(cost, tokensOutput, "output") + computeTokenCost(cost, tokensReasoning, "reasoning")

  return {
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
}

interface ResolveUsageInput {
  readonly attrs: readonly OtlpKeyValue[]
  readonly provider: string
  readonly model: string
}

export function resolveUsage({ attrs, provider, model }: ResolveUsageInput): ResolvedUsage {
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

  const costIsEstimated = !hasAttrCosts && costEstimation !== undefined
  const costInput = attrCostInput ?? costEstimation?.input ?? 0
  const costOutput = attrCostOutput ?? costEstimation?.output ?? 0
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
  }
}
