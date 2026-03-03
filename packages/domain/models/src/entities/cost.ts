/**
 * Cost estimation types and computations for LLM token usage.
 *
 * Supports tiered pricing where different token ranges have
 * different per-million-token rates.
 */

export type TokenType = "input" | "output" | "reasoning" | "cacheRead" | "cacheWrite"

export type TokenUsage = {
  readonly input: number
  readonly output: number
  readonly reasoning?: number | undefined
  readonly cacheRead?: number | undefined
  readonly cacheWrite?: number | undefined
}

export type ModelCostTier = {
  readonly input: number
  readonly output: number
  readonly reasoning?: number | undefined
  readonly cacheRead?: number | undefined
  readonly cacheWrite?: number | undefined
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
    readonly direct: TokenCostEntry
    readonly cacheRead: TokenCostEntry
    readonly cacheWrite: TokenCostEntry
  }
  readonly output: {
    readonly direct: TokenCostEntry
    readonly reasoning: TokenCostEntry
  }
}

function getCostPerToken(tier: ModelCostTier, tokenType: TokenType): number {
  if (tokenType === "input") return tier.input
  if (tokenType === "output") return tier.output
  if (tokenType === "reasoning") return tier.reasoning ?? tier.output
  if (tokenType === "cacheRead") return tier.cacheRead ?? tier.input
  if (tokenType === "cacheWrite") return tier.cacheWrite ?? tier.input
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
 * Sums up costs for all token types: input, cache read, cache write, reasoning, and output.
 */
export function estimateTotalCost(costSpec: ModelCostSpec, usage: TokenUsage): number {
  const input = sanitizeTokenCount(usage.input)
  const cacheRead = sanitizeTokenCount(usage.cacheRead)
  const cacheWrite = sanitizeTokenCount(usage.cacheWrite)
  const reasoning = sanitizeTokenCount(usage.reasoning)
  const output = sanitizeTokenCount(usage.output)

  return (
    computeTokenCost(costSpec, input, "input") +
    computeTokenCost(costSpec, cacheRead, "cacheRead") +
    computeTokenCost(costSpec, cacheWrite, "cacheWrite") +
    computeTokenCost(costSpec, reasoning, "reasoning") +
    computeTokenCost(costSpec, output, "output")
  )
}

/**
 * Compute a detailed cost breakdown by token type.
 *
 * Returns per-category token counts and costs for input, cache read,
 * cache write, reasoning, and output tokens.
 */
export function computeCostBreakdown(costSpec: ModelCostSpec, usage: TokenUsage): CostBreakdown {
  const input = sanitizeTokenCount(usage.input)
  const cacheRead = sanitizeTokenCount(usage.cacheRead)
  const cacheWrite = sanitizeTokenCount(usage.cacheWrite)
  const reasoning = sanitizeTokenCount(usage.reasoning)
  const output = sanitizeTokenCount(usage.output)

  return {
    input: {
      direct: {
        tokens: input,
        cost: computeTokenCost(costSpec, input, "input"),
      },
      cacheRead: {
        tokens: cacheRead,
        cost: computeTokenCost(costSpec, cacheRead, "cacheRead"),
      },
      cacheWrite: {
        tokens: cacheWrite,
        cost: computeTokenCost(costSpec, cacheWrite, "cacheWrite"),
      },
    },
    output: {
      direct: {
        tokens: output,
        cost: computeTokenCost(costSpec, output, "output"),
      },
      reasoning: {
        tokens: reasoning,
        cost: computeTokenCost(costSpec, reasoning, "reasoning"),
      },
    },
  }
}
