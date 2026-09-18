import type { Signal } from "./entities/signal.ts"

export type SignalScoringEligibility = Pick<Signal, "origin" | "promotedAt" | "ignoredAt" | "deletedAt">

export const isSignalEligibleForScoring = (signal: SignalScoringEligibility): boolean =>
  signal.origin === "system" && signal.promotedAt !== null && signal.ignoredAt === null && signal.deletedAt == null

/**
 * The ids of the signals whose occurrences may inform a score.
 *
 * Beside the predicate on purpose: readers that only ever see ids still have to agree with the ones
 * that see whole signals, and a caller filtering by hand is how the two drift.
 */
export const scoringEligibleSignalIds = (
  signals: readonly (SignalScoringEligibility & { readonly id: string })[],
): ReadonlySet<string> => new Set(signals.filter(isSignalEligibleForScoring).map((signal) => signal.id))
