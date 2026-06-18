import { z } from "zod"

/**
 * The single score-shaped execution contract (`specs/sandbox-runtime.md`).
 * Scripts return a `Score(value, passed, feedback?)` (or the `Passed`/`Failed`
 * sugar); the script itself decides membership via `passed` — there is no
 * host-side threshold. `passed = true` means the signal's behavior is present
 * in this trace (an occurrence); `value` is a [0, 1] confidence used for
 * sort/display only.
 */
export const scriptScoreSchema = z.object({
  value: z.number().min(0).max(1),
  passed: z.boolean(),
  feedback: z.string().optional(),
})
export type ScriptScore = z.infer<typeof scriptScoreSchema>

export const runResultSchema = z.object({
  /** Confidence ∈ [0, 1] — sort/display only, never membership. */
  value: z.number().min(0).max(1),
  /** Membership verdict decided by the script: behavior present in this trace. */
  passed: z.boolean(),
  /** Judge-grade detectors only; optional. */
  feedback: z.string().optional(),
  /** Wall time of the run including host calls, in nanoseconds. */
  duration: z.number().int().nonnegative(),
  /** Total tokens consumed by `llm()` calls (0 for pure runs). */
  tokens: z.number().int().nonnegative(),
  /** Microcents consumed by `llm()` calls (0 for pure runs). */
  cost: z.number().int().nonnegative(),
})
export type RunResult = z.infer<typeof runResultSchema>
