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
