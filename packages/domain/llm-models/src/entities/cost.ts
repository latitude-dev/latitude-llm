/**
 * Cost estimation types and computations for LLM token usage.
 *
 * Supports tiered pricing where different token ranges have
 * different per-million-token rates.
 */

export type TokenType = "input" | "output" | "reasoning" | "cacheRead"

export type TokenUsage = {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly reasoningTokens?: number
  readonly cachedInputTokens?: number
}

export type ModelCostTier = {
  readonly input: number
  readonly output: number
  readonly reasoning?: number | undefined
  readonly cacheRead?: number | undefined
  readonly tokensRangeStart?: number | undefined
}

export type ModelCostSpec = ModelCostTier | ModelCostTier[]

export type CostLookupResult = {
  readonly cost: ModelCostSpec
  readonly costImplemented: boolean
}

export type TokenCostEntry = {
  readonly tokens: number
  readonly cost: number
}

export type CostBreakdown = {
  readonly input: {
    readonly prompt: TokenCostEntry
    readonly cached: TokenCostEntry
  }
  readonly output: {
    readonly reasoning: TokenCostEntry
    readonly completion: TokenCostEntry
  }
}

function getCostPerToken(tier: ModelCostTier, tokenType: TokenType): number {
  if (tokenType === "input") return tier.input
  if (tokenType === "output") return tier.output
  if (tokenType === "reasoning") return tier.reasoning ?? tier.output
  if (tokenType === "cacheRead") return tier.cacheRead ?? tier.input
  return 0
}

/**
 * Compute the cost for a given number of tokens using the pricing spec.
 *
 * Handles tiered pricing: when `costSpec` is an array, each tier
 * applies from its `tokensRangeStart` up to the next tier's start.
 * Cost rates are per 1 million tokens.
 */
export function computeTokenCost(costSpec: ModelCostSpec, tokens: number, tokenType: TokenType): number {
  const tiers = Array.isArray(costSpec) ? costSpec : [costSpec]
  const sorted = tiers.slice().sort((a, b) => (a.tokensRangeStart ?? 0) - (b.tokensRangeStart ?? 0))

  let totalCost = 0

  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i]
    if (!tier) continue

    const tierStart = tier.tokensRangeStart ?? 0
    const tierEnd =
      i + 1 < sorted.length ? (sorted[i + 1]?.tokensRangeStart ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY

    if (tokens <= tierStart) break

    const tokensInTier = Math.min(tokens, tierEnd) - tierStart
    const rate = getCostPerToken(tier, tokenType)

    totalCost += (rate * tokensInTier) / 1_000_000
  }

  return totalCost
}

function sanitizeTokenCount(value: number | undefined): number {
  if (value === undefined) return 0
  if (Number.isNaN(value)) return 0
  return value
}

/**
 * Estimate the total cost for a given token usage and pricing spec.
 *
 * Sums up costs for all token types: input, cached input, reasoning, and output.
 */
export function estimateTotalCost(costSpec: ModelCostSpec, usage: TokenUsage): number {
  const prompt = sanitizeTokenCount(usage.promptTokens)
  const cached = sanitizeTokenCount(usage.cachedInputTokens)
  const reasoning = sanitizeTokenCount(usage.reasoningTokens)
  const completion = sanitizeTokenCount(usage.completionTokens)

  return (
    computeTokenCost(costSpec, prompt, "input") +
    computeTokenCost(costSpec, cached, "cacheRead") +
    computeTokenCost(costSpec, reasoning, "reasoning") +
    computeTokenCost(costSpec, completion, "output")
  )
}

/**
 * Compute a detailed cost breakdown by token type.
 *
 * Returns per-category token counts and costs for prompt, cached,
 * reasoning, and completion tokens.
 */
export function computeCostBreakdown(costSpec: ModelCostSpec, usage: TokenUsage): CostBreakdown {
  const prompt = sanitizeTokenCount(usage.promptTokens)
  const cached = sanitizeTokenCount(usage.cachedInputTokens)
  const reasoning = sanitizeTokenCount(usage.reasoningTokens)
  const completion = sanitizeTokenCount(usage.completionTokens)

  return {
    input: {
      prompt: {
        tokens: prompt,
        cost: computeTokenCost(costSpec, prompt, "input"),
      },
      cached: {
        tokens: cached,
        cost: computeTokenCost(costSpec, cached, "cacheRead"),
      },
    },
    output: {
      reasoning: {
        tokens: reasoning,
        cost: computeTokenCost(costSpec, reasoning, "reasoning"),
      },
      completion: {
        tokens: completion,
        cost: computeTokenCost(costSpec, completion, "output"),
      },
    },
  }
}
