import type { GenerateResult } from "@domain/ai"

export interface TokenUsageTotals {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly attempts: number
  readonly successes: number
}

const EMPTY: TokenUsageTotals = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  attempts: 0,
  successes: 0,
}

/**
 * Mutable counters for LLM calls made during a single benchmark classification.
 * `attempts` bumps on every `ai.generate(...)` invocation (success or error);
 * `successes` only bumps on success. Tokens are accumulated on success.
 *
 * This split is what lets us distinguish the `schema-mismatch` decision phase
 * (the LLM was called, its response didn't match the schema, the classifier
 * recovered to `matched=false`) from a clean `llm-no-match`.
 *
 * Created per-row in the runner so decision-phase detection is per-row-safe
 * under `Effect.forEach` concurrency.
 */
export interface TokenMeter {
  recordAttempt(): void
  recordSuccess(usage: GenerateResult<unknown>["tokenUsage"]): void
  snapshot(): TokenUsageTotals
}

export function createTokenMeter(): TokenMeter {
  let totals: TokenUsageTotals = EMPTY
  return {
    recordAttempt() {
      totals = { ...totals, attempts: totals.attempts + 1 }
    },
    recordSuccess(usage) {
      totals = {
        input: totals.input + (usage?.input ?? 0),
        output: totals.output + (usage?.output ?? 0),
        reasoning: totals.reasoning + (usage?.reasoning ?? 0),
        cacheRead: totals.cacheRead + (usage?.cacheRead ?? 0),
        cacheWrite: totals.cacheWrite + (usage?.cacheWrite ?? 0),
        attempts: totals.attempts,
        successes: totals.successes + 1,
      }
    },
    snapshot() {
      return { ...totals }
    },
  }
}

/**
 * Aggregate multiple per-row snapshots into a single total. Used in the
 * orchestrator after all rows have been classified.
 */
export function sumTotals(snapshots: readonly TokenUsageTotals[]): TokenUsageTotals {
  return snapshots.reduce<TokenUsageTotals>(
    (acc, s) => ({
      input: acc.input + s.input,
      output: acc.output + s.output,
      reasoning: acc.reasoning + s.reasoning,
      cacheRead: acc.cacheRead + s.cacheRead,
      cacheWrite: acc.cacheWrite + s.cacheWrite,
      attempts: acc.attempts + s.attempts,
      successes: acc.successes + s.successes,
    }),
    EMPTY,
  )
}
