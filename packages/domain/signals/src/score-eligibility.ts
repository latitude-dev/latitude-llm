import type { Signal } from "./entities/signal.ts"

export type SignalScoringEligibility = Pick<Signal, "origin" | "promotedAt" | "ignoredAt" | "deletedAt">

export const isSignalEligibleForScoring = (signal: SignalScoringEligibility): boolean =>
  signal.origin === "system" && signal.promotedAt !== null && signal.ignoredAt === null && signal.deletedAt == null
