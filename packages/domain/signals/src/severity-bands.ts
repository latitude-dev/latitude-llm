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

/**
 * Sessions a signal must touch before a share is treated as a measurement at all.
 *
 * A ratio with a tiny numerator is noise wearing a percentage sign. Measured
 * across 90 days of production, a quarter of the signals the bands called
 * `urgent` affected exactly one session — arithmetically they must sit in
 * projects of five sessions or fewer, since one session cannot otherwise reach
 * 20% — and 61% of `high` affected fewer than five.
 *
 * Guards the numerator rather than the project size on purpose. A minimum
 * project size would also block the genuine case: 40 of 80 sessions really is
 * urgent, and a small customer should not be unreachable by volume for being
 * small. What is never true is that one session is widespread.
 *
 * Floors are unaffected — a `pii-leakage` signal is still urgent on its first
 * occurrence, and escalation still raises. This only stops *volume* from
 * claiming a spread it has not seen.
 */
const MIN_AFFECTED_SESSIONS = 5

const rank = (level: SignalPriority): number => ALERT_SEVERITIES.indexOf(level)

const raiseOneTier = (level: SignalPriority): SignalPriority =>
  ALERT_SEVERITIES[Math.min(rank(level) + 1, ALERT_SEVERITIES.length - 1)] ?? level

export interface LevelForImpactInput {
  /** Fraction in `[0, 1]` — `affectedSessionsPercent` from the impact rollup. */
  readonly affectedSessionsPercent: number
  /** Distinct sessions the signal touches. Below `MIN_AFFECTED_SESSIONS` the share is not trusted. */
  readonly affectedSessions: number
  /** The signal is inside an open escalation right now. */
  readonly escalating: boolean
  /**
   * Intrinsic severity already established for this signal, which volume may
   * exceed but never undercut. Null leaves the level to volume alone.
   */
  readonly floor?: SignalPriority | null
}

/**
 * The level a signal earns from what it is currently doing, never below the
 * severity something already established about it.
 *
 * Escalation raises it one tier rather than bypassing the threshold: a rate
 * breaking its seasonal band is evidence the thing matters more than its
 * steady-state share suggests, and expressing that as a level keeps one rule
 * for delivery — "below your threshold stays quiet" holds with no exceptions.
 * It comes back down when the escalation ends, because this is recomputed
 * rather than latched.
 *
 * The floor is what keeps volume from arguing with severity. Both directions of
 * the volume model are still live above it, but a card number read back to one
 * customer is urgent at any share of traffic, and no measurement of how rare it
 * is should say otherwise.
 *
 * Too few affected sessions and the share is not read at all: see
 * `MIN_AFFECTED_SESSIONS`.
 */
export const levelForImpact = (input: LevelForImpactInput): SignalPriority => {
  const measurable = input.affectedSessions >= MIN_AFFECTED_SESSIONS
  const band = measurable
    ? IMPACT_BANDS.find((candidate) => input.affectedSessionsPercent >= candidate.minPercent)
    : undefined
  const base = band?.level ?? "low"
  const measured = input.escalating ? raiseOneTier(base) : base
  const floor = input.floor
  if (floor === null || floor === undefined) return measured
  return rank(floor) > rank(measured) ? floor : measured
}
