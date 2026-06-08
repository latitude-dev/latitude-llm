import {
  CONVERSATION_MOMENT_CONTINUITY_DEFAULT_THRESHOLD,
  CONVERSATION_MOMENT_CONTINUITY_MAX_THRESHOLD,
  CONVERSATION_MOMENT_CONTINUITY_MIN_THRESHOLD,
} from "./constants.ts"
import { SemanticMomentBoundaryReason } from "./entities/session-semantic-moment.ts"

export interface SemanticSegmentationTurn {
  readonly index: number
  readonly role: "user" | "assistant" | "tool" | "system" | "unknown"
  readonly content: string
  readonly embedding: readonly number[]
}

export interface SemanticMomentSegment {
  readonly firstTurnIndex: number
  readonly lastTurnIndex: number
  readonly turnIndexes: readonly number[]
  readonly boundaryReason:
    | typeof SemanticMomentBoundaryReason.SessionStart
    | typeof SemanticMomentBoundaryReason.SemanticDrift
    | typeof SemanticMomentBoundaryReason.MaxLength
  readonly centroidEmbedding: readonly number[]
  readonly coherenceScore: number
}

interface SegmentSemanticMomentsInput {
  readonly turns: readonly SemanticSegmentationTurn[]
  readonly threshold?: number
  readonly continuityClamps?: ContinuityClamps
  readonly maxTurnsPerMoment?: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const middleValue = sorted[middle] ?? 0
  if (sorted.length % 2 === 1) return middleValue
  return ((sorted[middle - 1] ?? middleValue) + middleValue) / 2
}

const magnitude = (vector: readonly number[]): number =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))

export const cosineSimilarity = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  const denominator = magnitude(a) * magnitude(b)
  if (denominator === 0) return 0
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0) / denominator
}

const meanEmbedding = (embeddings: readonly (readonly number[])[]): readonly number[] => {
  const first = embeddings[0]
  if (!first) return []
  const totals = new Array(first.length).fill(0) as number[]
  for (const embedding of embeddings) {
    for (let index = 0; index < first.length; index++) totals[index] += embedding[index] ?? 0
  }
  return totals.map((total) => total / embeddings.length)
}

const coherence = (embeddings: readonly (readonly number[])[], centroid: readonly number[]): number => {
  if (embeddings.length === 0) return 0
  const average =
    embeddings.reduce((sum, embedding) => sum + cosineSimilarity(embedding, centroid), 0) / embeddings.length
  return clamp(average, 0, 1)
}

interface ContinuityClamps {
  readonly min: number
  readonly default: number
  readonly max: number
}

export const computeSessionContinuityThreshold = (
  turns: readonly SemanticSegmentationTurn[],
  clamps?: ContinuityClamps,
): number => {
  const range = clamps ?? {
    min: CONVERSATION_MOMENT_CONTINUITY_MIN_THRESHOLD,
    default: CONVERSATION_MOMENT_CONTINUITY_DEFAULT_THRESHOLD,
    max: CONVERSATION_MOMENT_CONTINUITY_MAX_THRESHOLD,
  }
  const adjacentSimilarities = turns
    .slice(1)
    .map((turn, index) => cosineSimilarity(turns[index]?.embedding ?? [], turn.embedding))

  if (adjacentSimilarities.length < 6) return range.default

  const adjacentMedian = median(adjacentSimilarities)
  const deviations = adjacentSimilarities.map((similarity) => Math.abs(similarity - adjacentMedian))
  const mad = median(deviations)

  return clamp(adjacentMedian - 1.5 * mad, range.min, range.max)
}

export const segmentSemanticMoments = ({
  turns,
  continuityClamps,
  threshold = computeSessionContinuityThreshold(turns, continuityClamps),
  maxTurnsPerMoment = 12,
}: SegmentSemanticMomentsInput): readonly SemanticMomentSegment[] => {
  const eligibleTurns = turns.filter((turn) => turn.content.trim().length > 0 && turn.embedding.length > 0)
  if (eligibleTurns.length === 0) return []

  const segments: SemanticMomentSegment[] = []
  let currentTurns: SemanticSegmentationTurn[] = [eligibleTurns[0] as SemanticSegmentationTurn]
  let boundaryReason: SemanticMomentSegment["boundaryReason"] = SemanticMomentBoundaryReason.SessionStart

  const closeCurrent = () => {
    const embeddings = currentTurns.map((turn) => turn.embedding)
    const centroidEmbedding = meanEmbedding(embeddings)
    segments.push({
      firstTurnIndex: currentTurns[0]?.index ?? 0,
      lastTurnIndex: currentTurns[currentTurns.length - 1]?.index ?? 0,
      turnIndexes: currentTurns.map((turn) => turn.index),
      boundaryReason,
      centroidEmbedding,
      coherenceScore: coherence(embeddings, centroidEmbedding),
    })
  }

  for (let turnIndex = 1; turnIndex < eligibleTurns.length; turnIndex++) {
    const turn = eligibleTurns[turnIndex] as SemanticSegmentationTurn
    const centroid = meanEmbedding(currentTurns.map((current) => current.embedding))
    const similarity = cosineSimilarity(turn.embedding, centroid)
    const maxLengthReached = currentTurns.length >= maxTurnsPerMoment
    // The smallest moment unit is a full exchange: boundaries are only
    // considered before a *user* turn, and never before the current moment
    // holds at least one user and one assistant turn — an assistant response
    // always belongs to the moment of the user turn it answers.
    const hasCompleteExchange =
      currentTurns.some((current) => current.role === "user") &&
      currentTurns.some((current) => current.role === "assistant")
    const attachToCurrent = !maxLengthReached && (turn.role !== "user" || !hasCompleteExchange)

    if (attachToCurrent || (similarity >= threshold && !maxLengthReached)) {
      currentTurns.push(turn)
      continue
    }

    closeCurrent()
    currentTurns = [turn]
    boundaryReason = maxLengthReached
      ? SemanticMomentBoundaryReason.MaxLength
      : SemanticMomentBoundaryReason.SemanticDrift
  }

  closeCurrent()
  return segments
}
