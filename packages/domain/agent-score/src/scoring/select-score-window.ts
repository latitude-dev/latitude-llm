import type { ScoreWindowSettings } from "../entities/agent-score-artifact.ts"

export const SCORE_WINDOW_REASONS = ["reachedTarget", "belowTargetAtLongestStep", "heldByHysteresis"] as const
export type ScoreWindowReason = (typeof SCORE_WINDOW_REASONS)[number]

/** One step's eligible-session count, as the source reports it. */
export interface ScoreWindowStepCount {
  readonly stepDays: number
  readonly eligibleSessions: number
}

export type ScoreWindowSelection =
  | {
      readonly status: "selected"
      readonly stepDays: number
      readonly eligibleSessionCount: number
      readonly reason: ScoreWindowReason
    }
  | {
      readonly status: "withheld"
      /** What the longest step could see, so the page can show progress toward the floor. */
      readonly eligibleSessionCount: number
      readonly sessionFloor: number
    }

const ascending = (counts: readonly ScoreWindowStepCount[]): ScoreWindowStepCount[] =>
  [...counts].sort((left, right) => left.stepDays - right.stepDays)

/**
 * The step the rules would pick with no memory of yesterday.
 *
 * Shortest first, because a shorter window describes the present more sharply; the longest step is
 * the fallback for a project that never reaches the target but is above the floor, and below that
 * there is nothing honest to publish.
 */
const baseChoice = (counts: readonly ScoreWindowStepCount[], settings: ScoreWindowSettings): ScoreWindowSelection => {
  const steps = ascending(counts)
  const longest = steps.at(-1)
  if (!longest) return { status: "withheld", eligibleSessionCount: 0, sessionFloor: settings.sessionFloor }

  const reachesTarget = steps.find((step) => step.eligibleSessions >= settings.sessionTarget)
  if (reachesTarget) {
    return {
      status: "selected",
      stepDays: reachesTarget.stepDays,
      eligibleSessionCount: reachesTarget.eligibleSessions,
      reason: "reachedTarget",
    }
  }
  if (longest.eligibleSessions >= settings.sessionFloor) {
    return {
      status: "selected",
      stepDays: longest.stepDays,
      eligibleSessionCount: longest.eligibleSessions,
      reason: "belowTargetAtLongestStep",
    }
  }
  return {
    status: "withheld",
    eligibleSessionCount: longest.eligibleSessions,
    sessionFloor: settings.sessionFloor,
  }
}

/**
 * The window this project's score covers today.
 *
 * Whole-week steps keep weekday composition stable, so two snapshots a day apart are comparable
 * rather than one covering four weekends and the other three. The chosen step is stored on the
 * snapshot, which is also where tomorrow's hysteresis reads it from.
 *
 * Hysteresis exists because a project sitting on the boundary would otherwise change window every
 * day, and every change moves the score for reasons that have nothing to do with the agent. A
 * shorter step has to clear the target by the margin before it is taken, and the current step has to
 * fall the same margin below the target before a longer one is. A project with no previous snapshot,
 * or whose last one was withheld, has nothing to be sticky about and chooses freshly.
 */
export const selectScoreWindow = ({
  counts,
  settings,
  previousStepDays,
}: {
  readonly counts: readonly ScoreWindowStepCount[]
  readonly settings: ScoreWindowSettings
  readonly previousStepDays?: number
}): ScoreWindowSelection => {
  const base = baseChoice(counts, settings)
  if (base.status === "withheld" || previousStepDays === undefined) return base

  const previous = counts.find((step) => step.stepDays === previousStepDays)
  if (!previous || previous.stepDays === base.stepDays) return base
  if (previous.eligibleSessions < settings.sessionFloor) return base

  const held: ScoreWindowSelection = {
    status: "selected",
    stepDays: previous.stepDays,
    eligibleSessionCount: previous.eligibleSessions,
    reason: "heldByHysteresis",
  }

  if (base.stepDays < previous.stepDays) {
    const shortenAt = settings.sessionTarget * (1 + settings.hysteresisMargin)
    return base.eligibleSessionCount >= shortenAt ? base : held
  }

  const lengthenBelow = settings.sessionTarget * (1 - settings.hysteresisMargin)
  return previous.eligibleSessions < lengthenBelow ? base : held
}
