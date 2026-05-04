import type { FlaggerStrategy } from "@domain/flaggers"
import { withAi } from "@platform/ai"
import { Effect } from "effect"
import type { FixtureRow } from "../types.ts"
import type { TokenUsageTotals } from "./meter.ts"
import { createTokenMeter, sumTotals } from "./meter.ts"
import { meteringAIGenerateLive } from "./metering-ai.ts"
import type { Prediction } from "./metrics.ts"
import type { BenchmarkTarget } from "./targets.ts"

interface RowOutcome {
  readonly row: FixtureRow
  readonly prediction: Prediction
  readonly usage: TokenUsageTotals
}

interface RunResult {
  readonly outcomes: readonly RowOutcome[]
  readonly usage: TokenUsageTotals
}

/**
 * Classify one fixture row. Uses a per-row meter so we can read `attempts` /
 * `successes` after the classifier returns and derive the decision phase.
 * All errors — classifier crashes, Bedrock throttling, network blips — get
 * caught and turned into a `phase: "error"` prediction so a single bad row
 * doesn't kill a 2-minute run.
 *
 * Phase resolution on success:
 *   - attempts === 0           → deterministic-{match,no-match} per result
 *   - attempts > 0, successes === attempts → llm-{match,no-match} per result
 *   - attempts > 0, successes < attempts   → schema-mismatch (LLM failed, classifier recovered to matched=false)
 * On failure:
 *   - phase === "error"; prediction.predicted === false (conservative default)
 */
interface ClassifyOutcome {
  readonly matched: boolean
  readonly error: string | null
}

const classifyOne = (target: BenchmarkTarget, row: FixtureRow, strategyOverride?: FlaggerStrategy) =>
  Effect.gen(function* () {
    const meter = createTokenMeter()
    const outcome = yield* target.classify(row, strategyOverride).pipe(
      withAi(meteringAIGenerateLive(meter)),
      Effect.match({
        onFailure: (err): ClassifyOutcome => ({
          matched: false,
          error: err instanceof Error ? err.message : String(err),
        }),
        onSuccess: (result): ClassifyOutcome => ({ matched: result.matched, error: null }),
      }),
    )

    const usage = meter.snapshot()
    const prediction: Prediction =
      outcome.error !== null
        ? {
            id: row.id,
            expected: row.expected.matched,
            predicted: outcome.matched,
            phase: "error",
            tags: row.tags,
            errorMessage: truncate(outcome.error, 200),
          }
        : {
            id: row.id,
            expected: row.expected.matched,
            predicted: outcome.matched,
            phase: derivePhase(usage, outcome.matched),
            tags: row.tags,
          }
    return { row, prediction, usage } satisfies RowOutcome
  })

function derivePhase(usage: TokenUsageTotals, matched: boolean): Prediction["phase"] {
  if (usage.attempts === 0) return matched ? "deterministic-match" : "deterministic-no-match"
  if (usage.successes < usage.attempts) return "schema-mismatch"
  return matched ? "llm-match" : "llm-no-match"
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

interface RunOptions {
  readonly concurrency?: number
  readonly onProgress?: (done: number, total: number) => void
  /**
   * If set, every row's classify call uses this in-memory strategy instead
   * of the one looked up from the static flagger registry. Used by the
   * optimizer's pre-adoption validation pass so a freshly-proposed winner
   * (whose source isn't yet on disk, or whose source is on disk but the
   * Node module cache still holds the previous version) gets evaluated
   * against the actual candidate text rather than the stale registry.
   */
  readonly strategyOverride?: FlaggerStrategy
}

/**
 * Classify every row for a target and return the aggregated outcomes plus
 * total token usage. Concurrency defaults to 4 — sized for Bedrock Nova
 * Lite's on-demand TPM quota in eu-central-1 (see the inline comment
 * below for the math). Bump via options for higher-rate-limit models.
 */
export const runTarget = (target: BenchmarkTarget, rows: readonly FixtureRow[], options: RunOptions = {}) =>
  Effect.gen(function* () {
    // Default 4. Bedrock Nova Lite (eu-central-1, on-demand) throttles at
    // ~100k tokens/min; with ~2KB prompts on ~1k rows, concurrency 10+
    // saturates the quota and hits ThrottlingException after 3 SDK retries.
    // Bump via `--concurrency N` if you're on a higher-tier quota.
    const concurrency = options.concurrency ?? 4
    let done = 0
    const total = rows.length
    const tickOne = (row: FixtureRow) =>
      classifyOne(target, row, options.strategyOverride).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            done++
            options.onProgress?.(done, total)
          }),
        ),
      )
    const outcomes = yield* Effect.forEach(rows, tickOne, { concurrency })
    return {
      outcomes,
      usage: sumTotals(outcomes.map((o) => o.usage)),
    } satisfies RunResult
  })
