import type { IssueOccurrenceAggregate, ScoreSource } from "@domain/scores"
import {
  AUTO_RESOLVE_INACTIVITY_DAYS,
  CENTROID_EMBEDDING_DIMENSIONS,
  CENTROID_EMBEDDING_MODEL,
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
  ESCALATION_MIN_OCCURRENCES_THRESHOLD,
  ESCALATION_THRESHOLD_FACTOR,
  ISSUE_STATES,
  NEW_ISSUE_AGE_DAYS,
} from "./constants.ts"
import { type Issue, type IssueCentroid, IssueState, type IssueState as IssueStateValue } from "./entities/issue.ts"

const MILLISECONDS_PER_SECOND = 1000
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

const zeroVector = (dimensions: number) => new Array<number>(dimensions).fill(0)

function l2Norm(vector: ArrayLike<number>): number {
  let sum = 0
  for (let index = 0; index < vector.length; index++) {
    const value = vector[index] ?? 0
    sum += value * value
  }
  return Math.sqrt(sum)
}

/**
 * Shared L2-normalization primitive for centroid math.
 * Writes into a caller-provided buffer so the hot path can avoid extra arrays.
 */
function normalizeTo(out: Float32Array, src: ArrayLike<number>): void {
  const magnitude = l2Norm(src)
  const inverse = magnitude > 0 ? 1 / magnitude : 0

  for (let index = 0; index < src.length; index++) {
    out[index] = (src[index] ?? 0) * inverse
  }
}

function scaleInPlace(vector: Float32Array, scale: number): void {
  for (let index = 0; index < vector.length; index++) {
    vector[index] *= scale
  }
}

/**
 * Advance a persisted centroid state from `clusteredAt` to `timestamp`.
 * Used only by `updateIssueCentroid` before adding or removing one score
 * contribution, and mutates the working buffer in place for efficiency.
 */
function applyDecay(
  base: Float32Array,
  mass: number,
  clusteredAt: Date,
  timestamp: Date,
  halfLifeSeconds: number,
): number {
  const delta = timestamp.getTime() - clusteredAt.getTime()
  if (delta <= 0) {
    return mass
  }

  const halfLifeMilliseconds = halfLifeSeconds * MILLISECONDS_PER_SECOND
  const alpha = 0.5 ** (delta / halfLifeMilliseconds)
  scaleInPlace(base, alpha)
  return mass * alpha
}

/**
 * Create a brand-new issue centroid with the current discovery configuration.
 * Use this only when creating a new issue before it has any clustered scores.
 */
export const createIssueCentroid = (): IssueCentroid => ({
  base: zeroVector(CENTROID_EMBEDDING_DIMENSIONS),
  mass: 0,
  model: CENTROID_EMBEDDING_MODEL,
  decay: CENTROID_HALF_LIFE_SECONDS,
  weights: { ...CENTROID_SOURCE_WEIGHTS },
})

export interface UpdateIssueCentroidInput {
  readonly centroid: IssueCentroid & { clusteredAt: Date }
  readonly score: {
    readonly embedding: readonly number[]
    readonly source: ScoreSource
    readonly createdAt: Date
  }
  readonly operation: "add" | "remove"
  readonly timestamp: Date
}

/**
 * Canonical v2 centroid update step for issue membership changes.
 *
 * This is used when a score is attached to or removed from an issue: first
 * decay the stored running sum/mass from `clusteredAt`, then normalize the
 * score embedding, weight it by source and recency, and finally update the
 * persisted centroid state that will later be projected to Weaviate.
 */
export const updateIssueCentroid = ({
  centroid,
  score,
  operation,
  timestamp,
}: UpdateIssueCentroidInput): IssueCentroid & { clusteredAt: Date } => {
  if (centroid.base.length !== score.embedding.length) {
    throw new Error(`Dimension mismatch: centroid has ${centroid.base.length}, score has ${score.embedding.length}`)
  }

  const outBase = new Float32Array(centroid.base)
  let outMass = applyDecay(outBase, centroid.mass, centroid.clusteredAt, timestamp, centroid.decay)

  const halfLifeMilliseconds = centroid.decay * MILLISECONDS_PER_SECOND
  const elapsed = Math.max(0, timestamp.getTime() - score.createdAt.getTime())
  const recency = 0.5 ** (elapsed / halfLifeMilliseconds)
  const contributionMass = (centroid.weights[score.source] ?? 1) * recency

  const normalizedScore = new Float32Array(score.embedding.length)
  normalizeTo(normalizedScore, score.embedding)

  const sign = operation === "add" ? 1 : -1
  for (let index = 0; index < outBase.length; index++) {
    outBase[index] += sign * contributionMass * normalizedScore[index]
  }

  outMass = operation === "add" ? outMass + contributionMass : outMass - contributionMass
  if (outMass <= 0) {
    return {
      ...centroid,
      base: zeroVector(outBase.length),
      mass: 0,
      clusteredAt: timestamp,
    }
  }

  return {
    ...centroid,
    base: Array.from(outBase),
    mass: outMass,
    clusteredAt: timestamp,
  }
}

/**
 * Convert the persisted running sum into the unit vector used for cosine
 * search. Use this only when emitting an issue centroid to Weaviate or other
 * retrieval code; the stored centroid `base` itself stays unnormalized.
 */
export const normalizeIssueCentroid = (centroid: IssueCentroid): number[] => {
  if (centroid.mass <= 0 || centroid.base.length === 0) {
    return []
  }

  const normalized = new Float32Array(centroid.base)
  const magnitude = l2Norm(normalized)
  if (magnitude === 0) {
    return []
  }

  const inverse = 1 / magnitude
  for (let index = 0; index < normalized.length; index++) {
    normalized[index] *= inverse
  }

  return Array.from(normalized)
}

/**
 * Normalize a raw embedding for query-time cosine search.
 * Retrieval code uses this for incoming feedback/query embeddings, while
 * `updateIssueCentroid` handles normalization internally during state updates.
 */
export const normalizeEmbedding = (embedding: readonly number[]): number[] => {
  if (embedding.length === 0) {
    return []
  }

  const normalized = new Float32Array(embedding.length)
  normalizeTo(normalized, embedding)
  return Array.from(normalized)
}

export interface DeriveIssueLifecycleStatesInput {
  readonly issue: Issue
  readonly occurrence?: IssueOccurrenceAggregate | null
  readonly now?: Date
}

export const getEscalationOccurrenceThreshold = (baselineAvgOccurrences: number): number =>
  Math.max(
    ESCALATION_MIN_OCCURRENCES_THRESHOLD,
    Math.floor(Math.max(0, baselineAvgOccurrences) * ESCALATION_THRESHOLD_FACTOR) + 1,
  )

export const deriveIssueLifecycleStates = ({
  issue,
  occurrence,
  now = new Date(),
}: DeriveIssueLifecycleStatesInput): readonly IssueStateValue[] => {
  const firstSeenAt = occurrence?.firstSeenAt ?? issue.createdAt
  const lastSeenAt = occurrence?.lastSeenAt ?? issue.createdAt
  const states = new Set<IssueStateValue>()
  const isNew = firstSeenAt.getTime() > now.getTime() - NEW_ISSUE_AGE_DAYS * MILLISECONDS_PER_DAY

  if (isNew) {
    states.add(IssueState.New)
  }

  const recentOccurrences = occurrence?.recentOccurrences ?? 0
  const baselineAverage = occurrence?.baselineAvgOccurrences ?? 0
  if (!isNew && recentOccurrences >= getEscalationOccurrenceThreshold(baselineAverage)) {
    states.add(IssueState.Escalating)
  }

  const isRegressed = issue.resolvedAt !== null && lastSeenAt.getTime() > issue.resolvedAt.getTime()
  if (isRegressed) {
    states.add(IssueState.Regressed)
  }

  const isResolvedByInactivity =
    lastSeenAt.getTime() < now.getTime() - AUTO_RESOLVE_INACTIVITY_DAYS * MILLISECONDS_PER_DAY
  if (!isRegressed && (issue.resolvedAt !== null || isResolvedByInactivity)) {
    states.add(IssueState.Resolved)
  }

  if (issue.ignoredAt !== null) {
    states.add(IssueState.Ignored)
  }

  return ISSUE_STATES.filter((state): state is IssueStateValue => states.has(state))
}
