import { Effect } from "effect"
import {
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_ASSIGN_RELATIVE_MARGIN,
  TAXONOMY_ASSIGN_TEMPERATURE,
} from "../constants.ts"
import { softmax } from "../helpers.ts"
import type { NearestClusterMatch } from "../ports/taxonomy-cluster-repository.ts"

export type ClusterAssignmentDecision =
  | {
      readonly method: "centroid_online"
      readonly clusterId: string
      readonly confidence: number
    }
  | {
      readonly method: "noise"
      readonly clusterId: null
      readonly confidence: number
    }

export interface DecideClusterAssignmentInput {
  readonly topK: readonly NearestClusterMatch[]
}

// Assignment is load-bearing — `topK[0]` lands every online observation on a
// cluster. The port promises cosine-descending order but we sort defensively
// so a mocked or approximate-NN adapter can't silently reorder.
const sortedByCosineDesc = (topK: readonly NearestClusterMatch[]): readonly NearestClusterMatch[] =>
  [...topK].sort((a, b) => b.cosine - a.cosine)

export interface ClusterAssignmentGates {
  readonly absoluteThreshold: number
  readonly relativeMargin: number
}

export const decideClusterAssignment = (
  topK: readonly NearestClusterMatch[],
  gates?: ClusterAssignmentGates,
): ClusterAssignmentDecision => {
  if (topK.length === 0) return { method: "noise", clusterId: null, confidence: 0 }

  const absoluteThreshold = gates?.absoluteThreshold ?? TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD
  const relativeMargin = gates?.relativeMargin ?? TAXONOMY_ASSIGN_RELATIVE_MARGIN
  const sorted = sortedByCosineDesc(topK)
  const similarities = sorted.map((match) => match.cosine)
  const probabilities = softmax(similarities, TAXONOMY_ASSIGN_TEMPERATURE)
  const topSimilarity = similarities[0] ?? 0
  const absoluteOk = topSimilarity >= absoluteThreshold
  // The relative margin measures ambiguity BETWEEN candidates; with a single
  // candidate it passes trivially by design — a lone child still has to clear
  // the absolute gate (raised to the parent's split density during descent).
  const relativeOk = (probabilities[0] ?? 0) - (probabilities[1] ?? 0) >= relativeMargin

  if (absoluteOk && relativeOk) {
    const top = sorted[0]
    if (top) {
      return { method: "centroid_online", clusterId: top.cluster.id, confidence: topSimilarity }
    }
  }

  return { method: "noise", clusterId: null, confidence: topSimilarity }
}

export const decideClusterAssignmentUseCase = (input: DecideClusterAssignmentInput) =>
  Effect.gen(function* () {
    const sorted = sortedByCosineDesc(input.topK)
    const decision = decideClusterAssignment(sorted)
    const top1 = sorted[0]?.cosine ?? 0
    const top2 = sorted[1]?.cosine ?? 0
    yield* Effect.annotateCurrentSpan("taxonomy.assign.topk.cosine.top1", top1)
    yield* Effect.annotateCurrentSpan("taxonomy.assign.topk.cosine.top2", top2)
    yield* Effect.annotateCurrentSpan("taxonomy.assign.topk.cosine.spread", top1 - top2)
    yield* Effect.annotateCurrentSpan("taxonomy.assign.outcome", decision.method)
    return decision
  }).pipe(Effect.withSpan("taxonomy.decideClusterAssignment"))
