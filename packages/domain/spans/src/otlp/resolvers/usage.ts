import { computeTokenCost, getCostSpec } from "@domain/models"
import type { OtlpKeyValue } from "../types.ts"
import { first, fromFloat, fromInt } from "./utils.ts"

// ─── Tokens ──────────────────────────────────────────────

const tokensInputCandidates = [
  fromInt("gen_ai.usage.input_tokens"),
  fromInt("gen_ai.usage.prompt_tokens"),
  fromInt("llm.token_count.prompt"),
  fromInt("ai.usage.promptTokens"),
]

const tokensOutputCandidates = [
  fromInt("gen_ai.usage.output_tokens"),
  fromInt("gen_ai.usage.completion_tokens"),
  fromInt("llm.token_count.completion"),
  fromInt("ai.usage.completionTokens"),
]

const tokensCacheReadCandidates = [
  fromInt("gen_ai.usage.cache_read.input_tokens"),
  fromInt("gen_ai.usage.cache_read_input_tokens"),
  fromInt("llm.token_count.prompt_details.cache_read"),
]

const tokensCacheCreateCandidates = [
  fromInt("gen_ai.usage.cache_creation.input_tokens"),
  fromInt("llm.token_count.prompt_details.cache_write"),
]

const tokensReasoningCandidates = [
  fromInt("gen_ai.usage.reasoning_tokens"),
  fromInt("llm.token_count.completion_details.reasoning"),
]

// ─── Cost ────────────────────────────────────────────────

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
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
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
  const tokensInput = first(tokensInputCandidates, attrs) ?? 0
  const tokensOutput = first(tokensOutputCandidates, attrs) ?? 0
  const tokensCacheRead = first(tokensCacheReadCandidates, attrs) ?? 0
  const tokensCacheCreate = first(tokensCacheCreateCandidates, attrs) ?? 0
  const tokensReasoning = first(tokensReasoningCandidates, attrs) ?? 0

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
