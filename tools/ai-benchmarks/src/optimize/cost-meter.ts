/**
 * Running-total cost meter for an optimization run. Two cost streams:
 *
 *   - Proposer (Opus 4.7 xhigh): metered per propose call from the AI
 *     generate result. Coarse but cheap.
 *   - Judge (Nova Lite via SYSTEM_QUEUE_FLAGGER_MODEL): metered per
 *     evaluate call via the same `meteringAIGenerateLive` layer that
 *     `benchmark:run` uses, then converted to USD with `computeCost`.
 *
 * The meter is intentionally minimal — we add USD here, not tokens, because
 * pricing translation already happens upstream (proposer via the AI result
 * usage + pricing table; judge via `runner/pricing.ts`). Tokens travel
 * separately on the audit trail so per-iteration tables can show them too
 * if we want.
 */
interface CostMeterShape {
  addProposerUsd(usd: number): void
  addJudgeUsd(usd: number): void
  proposerTotalUsd(): number
  judgeTotalUsd(): number
  totalUsd(): number
  snapshot(): CostBreakdown
}

export interface CostBreakdown {
  readonly proposerUsd: number
  readonly judgeUsd: number
  readonly totalUsd: number
  /**
   * Number of judge-LLM row evaluations counted (i.e. addJudgeUsd was
   * called with usd > 0). Deterministic-phase evals are excluded since
   * they don't add to the meter. Used downstream to compute an average
   * judge-eval cost for the silent-skip estimate in the banner.
   */
  readonly judgeEvalCount: number
}

export const createCostMeter = (): CostMeterShape => {
  let proposer = 0
  let judge = 0
  let judgeEvalCount = 0
  return {
    addProposerUsd(usd) {
      if (Number.isFinite(usd) && usd > 0) proposer += usd
    },
    addJudgeUsd(usd) {
      if (Number.isFinite(usd) && usd > 0) {
        judge += usd
        judgeEvalCount += 1
      }
    },
    proposerTotalUsd: () => proposer,
    judgeTotalUsd: () => judge,
    totalUsd: () => proposer + judge,
    snapshot: () => ({
      proposerUsd: proposer,
      judgeUsd: judge,
      totalUsd: proposer + judge,
      judgeEvalCount,
    }),
  }
}
