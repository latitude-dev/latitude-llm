export type TokenCostEntry = {
  tokens: number
  cost?: number
}

export type ModelCostEntry = {
  input: {
    prompt: TokenCostEntry
    cached: TokenCostEntry
  }
  output: {
    reasoning: TokenCostEntry
    completion: TokenCostEntry
  }
}

export type CostBreakdown = Record<string, ModelCostEntry>

function mergeTokenCostEntry(
  a: TokenCostEntry,
  b: TokenCostEntry,
): TokenCostEntry {
  const hasCost = a.cost !== undefined || b.cost !== undefined
  return {
    tokens: a.tokens + b.tokens,
    cost: hasCost ? (a.cost ?? 0) + (b.cost ?? 0) : undefined,
  }
}

function mergeModelCostEntry(
  a: ModelCostEntry,
  b: ModelCostEntry,
): ModelCostEntry {
  return {
    input: {
      prompt: mergeTokenCostEntry(a.input.prompt, b.input.prompt),
      cached: mergeTokenCostEntry(a.input.cached, b.input.cached),
    },
    output: {
      reasoning: mergeTokenCostEntry(a.output.reasoning, b.output.reasoning),
      completion: mergeTokenCostEntry(a.output.completion, b.output.completion),
    },
  }
}

export function mergeCostBreakdown(
  target: CostBreakdown,
  source: CostBreakdown,
): CostBreakdown {
  const result = { ...target }

  for (const [key, entry] of Object.entries(source)) {
    const existing = result[key]
    if (existing) {
      result[key] = mergeModelCostEntry(existing, entry)
    } else {
      result[key] = structuredClone(entry)
    }
  }

  return result
}

export function entryCost(entry: ModelCostEntry): number {
  return (
    (entry.input.prompt.cost ?? 0) +
    (entry.input.cached.cost ?? 0) +
    (entry.output.reasoning.cost ?? 0) +
    (entry.output.completion.cost ?? 0)
  )
}

export function totalCost(breakdown: CostBreakdown): number {
  return Object.values(breakdown).reduce(
    (sum, entry) => sum + entryCost(entry),
    0,
  )
}

export function totalTokens(entry: ModelCostEntry): number {
  return (
    entry.input.prompt.tokens +
    entry.input.cached.tokens +
    entry.output.reasoning.tokens +
    entry.output.completion.tokens
  )
}

export function totalInputTokens(entry: ModelCostEntry): number {
  return entry.input.prompt.tokens + entry.input.cached.tokens
}

export function totalOutputTokens(entry: ModelCostEntry): number {
  return entry.output.reasoning.tokens + entry.output.completion.tokens
}

export function costBreakdownKey(provider: string, model: string): string {
  return `${provider}/${model}`
}
