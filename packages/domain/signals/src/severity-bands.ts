import { ALERT_SEVERITIES } from "@domain/shared"
import type { SignalPriority } from "./entities/signal.ts"

/**
 * Share of a project's sessions a signal has to touch to reach each level.
 *
 * A count means nothing on its own: four tool errors in a project with ten
 * sessions is most of the traffic, the same four in twenty thousand is noise.
 * The share is what carries across customers of wildly different size, so the
 * level is a measurement rather than a number someone picked per detector.
 *
 * Bands are deliberately coarse. The point is separating "barely anyone" from
 * "a noticeable slice" from "most of the traffic", not precision — a signal
 * sitting on a boundary would flip level on ordinary noise if these were tight.
 */
const IMPACT_BANDS: readonly { readonly minPercent: number; readonly level: SignalPriority }[] = [
  { minPercent: 0.2, level: "urgent" },
  { minPercent: 0.05, level: "high" },
  { minPercent: 0.01, level: "medium" },
  { minPercent: 0, level: "low" },
]

const rank = (level: SignalPriority): number => ALERT_SEVERITIES.indexOf(level)

const raiseOneTier = (level: SignalPriority): SignalPriority =>
  ALERT_SEVERITIES[Math.min(rank(level) + 1, ALERT_SEVERITIES.length - 1)] ?? level

export interface LevelForImpactInput {
  /** Fraction in `[0, 1]` — `affectedSessionsPercent` from the impact rollup. */
  readonly affectedSessionsPercent: number
  /** The signal is inside an open escalation right now. */
  readonly escalating: boolean
}

/**
 * The level a signal earns from what it is currently doing.
 *
 * Escalation raises it one tier rather than bypassing the threshold: a rate
 * breaking its seasonal band is evidence the thing matters more than its
 * steady-state share suggests, and expressing that as a level keeps one rule
 * for delivery — "below your threshold stays quiet" holds with no exceptions.
 * It comes back down when the escalation ends, because this is recomputed
 * rather than latched.
 */
export const levelForImpact = (input: LevelForImpactInput): SignalPriority => {
  const band = IMPACT_BANDS.find((candidate) => input.affectedSessionsPercent >= candidate.minPercent)
  const base = band?.level ?? "low"
  return input.escalating ? raiseOneTier(base) : base
}
