import { estimateTotalCost, getCostSpec, type TokenUsage } from "@domain/models"
import type { TokenUsageTotals } from "./meter.ts"

interface CostReport {
  readonly totalUsd: number | "unknown"
  readonly provider: string
  readonly modelId: string
  readonly usage: TokenUsageTotals
}

/**
 * Translate a benchmark run's accumulated token usage into USD using the
 * pricing from `@domain/models` (models.dev data).
 *
 * `getCostSpec` returns `{ costImplemented: false, cost: { input: 0, output: 0 } }`
 * for provider/model pairs that aren't in the catalog — it does NOT throw, so
 * `estimateCost` on an unknown model returns 0. We inspect the `costImplemented`
 * flag directly so unknown models report `"unknown"` instead of silently `$0`.
 */
export function computeCost(provider: string, modelId: string, usage: TokenUsageTotals): CostReport {
  const tokenUsage: TokenUsage = {
    input: usage.input,
    output: usage.output,
    reasoning: usage.reasoning,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
  }
  const spec = getCostSpec(provider, modelId)
  if (!spec.costImplemented) {
    return { totalUsd: "unknown", provider, modelId, usage }
  }
  return { totalUsd: estimateTotalCost(spec.cost, tokenUsage), provider, modelId, usage }
}
