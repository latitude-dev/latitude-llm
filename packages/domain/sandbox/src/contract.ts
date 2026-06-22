import { z } from "zod"
import { DEFAULT_SCRIPT_SCORE_THRESHOLD } from "./constants.ts"

/**
 * The single score-shaped execution contract (`specs/sandbox-runtime.md`).
 * Scripts return a `Score(value, feedback?)`; the host derives membership
 * from the owning signal's threshold — the script never decides membership.
 */
export const scriptScoreSchema = z.object({
  value: z.number().min(0).max(1),
  feedback: z.string().optional(),
})
export type ScriptScore = z.infer<typeof scriptScoreSchema>

export const runResultSchema = z.object({
  /** Signal-exhibition strength ∈ [0, 1] — never goodness. */
  value: z.number().min(0).max(1),
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

/** Host-derived membership: a run matches when its value reaches the threshold. */
export const isScoreMatch = (value: number, threshold: number = DEFAULT_SCRIPT_SCORE_THRESHOLD): boolean =>
  value >= threshold
