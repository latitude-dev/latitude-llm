import { DEFAULT_EMBEDDING_CONFIG, EMBEDDING_DIMENSIONS } from "@domain/ai"
import type {
  EscalationDecision,
  EscalationDecisionInput,
  EscalationExitReason,
  EscalationTransition,
} from "@domain/incidents"
import type { ScoreSourceType } from "@domain/scores"
import {
  createCentroid,
  normalizeCentroid,
  normalizeEmbedding as sharedNormalizeEmbedding,
  updateCentroid,
} from "@domain/shared"
import {
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
  ESCALATION_EXIT_THRESHOLD_FACTOR,
  ESCALATION_MIN_OCCURRENCES_THRESHOLD,
  ESCALATION_THRESHOLD_FACTOR,
  NEW_SIGNAL_AGE_DAYS,
  SIGNAL_STATES,
} from "./constants.ts"
import {
  type Signal,
  type SignalCentroid,
  SignalState,
  type SignalState as SignalStateValue,
} from "./entities/signal.ts"

export { evaluateSeasonalEscalation, seasonalAnomalyThreshold } from "@domain/incidents"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Create a brand-new issue centroid with the current discovery configuration.
 * Use this only when creating a new issue before it has any clustered scores.
 * Callers with a resolved embedding config pass its model; the default keeps
 * tests and legacy paths on the stock configuration.
 */
export const createSignalCentroid = (model: string = DEFAULT_EMBEDDING_CONFIG.model): SignalCentroid =>
  createCentroid({
    dimensions: EMBEDDING_DIMENSIONS,
    model,
    halfLifeSeconds: CENTROID_HALF_LIFE_SECONDS,
    weights: { ...CENTROID_SOURCE_WEIGHTS },
  }) as SignalCentroid

export interface UpdateSignalCentroidInput {
  readonly centroid: SignalCentroid & { clusteredAt: Date }
  readonly score: {
    readonly embedding: readonly number[]
    readonly sourceType: ScoreSourceType
    readonly createdAt: Date
  }
  readonly operation: "add" | "remove"
  readonly timestamp: Date
}

/**
 * Canonical centroid update step for issue membership changes. Delegates to
 * the shared running-decayed-sum primitive in `@domain/shared/centroid` after
 * resolving the per-source weight from the centroid's weight scheme.
 */
export const updateSignalCentroid = ({
  centroid,
  score,
  operation,
  timestamp,
}: UpdateSignalCentroidInput): SignalCentroid & { clusteredAt: Date } => {
  if (centroid.base.length !== score.embedding.length) {
    throw new Error(`Dimension mismatch: centroid has ${centroid.base.length}, score has ${score.embedding.length}`)
  }
  const contributionWeight = centroid.weights[score.sourceType] ?? 1
  return updateCentroid({
    centroid,
    contribution: { embedding: score.embedding, createdAt: score.createdAt },
    contributionWeight,
    operation,
    timestamp,
  }) as SignalCentroid & { clusteredAt: Date }
}

/**
 * Convert the persisted running sum into the unit vector used for cosine
 * search. The stored centroid `base` itself stays unnormalized.
 */
export const normalizeSignalCentroid = (centroid: SignalCentroid): number[] => normalizeCentroid(centroid)

/**
 * Normalize a raw embedding for query-time cosine search.
 */
export const normalizeEmbedding = (embedding: readonly number[]): number[] => sharedNormalizeEmbedding(embedding)

export interface DeriveSignalLifecycleStatesInput {
  readonly issue: Signal
  /** Lifecycle flags joined from `alert_incidents` by `SignalRepository` reads. */
  readonly isEscalating: boolean
  readonly now?: Date
}

export const getEscalationOccurrenceThreshold = (baselineAvgOccurrences: number): number =>
  Math.max(
    ESCALATION_MIN_OCCURRENCES_THRESHOLD,
    Math.floor(Math.max(0, baselineAvgOccurrences) * ESCALATION_THRESHOLD_FACTOR) + 1,
  )

/**
 * Hysteresis exit threshold: an escalating issue exits only when its recent
 * occurrence count drops below this value. Always strictly less than
 * `getEscalationOccurrenceThreshold(baselineAvgOccurrences)` so the entry
 * and exit conditions cannot both hold simultaneously at the same baseline.
 */
export const getEscalationExitThreshold = (baselineAvgOccurrences: number): number =>
  Math.floor(getEscalationOccurrenceThreshold(baselineAvgOccurrences) * ESCALATION_EXIT_THRESHOLD_FACTOR)

/**
 * A signal is "new" while its first seen timestamp is within
 * `NEW_SIGNAL_AGE_DAYS` of `now`. New signals are excluded from escalation
 * detection — their `baselineAvgOccurrences` window (days 1–8 ago) hasn't
 * filled in yet, so any volume above the floor would falsely trip the
 * threshold.
 */
export const isSignalNew = (firstSeenAt: Date, now: Date = new Date()): boolean =>
  firstSeenAt.getTime() > now.getTime() - NEW_SIGNAL_AGE_DAYS * MILLISECONDS_PER_DAY

export type SeasonalEscalationDecisionInput = EscalationDecisionInput
export type SeasonalEscalationTransition = EscalationTransition
export type SeasonalEscalationExitReason = EscalationExitReason
export type SeasonalEscalationDecision = EscalationDecision

export const deriveSignalLifecycleStates = ({
  issue,
  isEscalating,
  now = new Date(),
}: DeriveSignalLifecycleStatesInput): readonly SignalStateValue[] => {
  const states = new Set<SignalStateValue>()

  if (isSignalNew(issue.createdAt, now)) {
    states.add(SignalState.New)
  }

  if (isEscalating) {
    states.add(SignalState.Escalating)
  }

  if (issue.regressedAt !== null) {
    states.add(SignalState.Regressed)
  }

  if (issue.resolvedAt !== null) {
    states.add(SignalState.Resolved)
  }

  if (issue.ignoredAt !== null) {
    states.add(SignalState.Ignored)
  }

  if (states.size === 0) {
    states.add(SignalState.Ongoing)
  }

  return SIGNAL_STATES.filter((state): state is SignalStateValue => states.has(state))
}
