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

export const decideClusterAssignment = (topK: readonly NearestClusterMatch[]): ClusterAssignmentDecision => {
  if (topK.length === 0) return { method: "noise", clusterId: null, confidence: 0 }

  const similarities = topK.map((match) => match.cosine)
  const probabilities = softmax(similarities, TAXONOMY_ASSIGN_TEMPERATURE)
  const topSimilarity = similarities[0] ?? 0
  const absoluteOk = topSimilarity >= TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD
  const relativeOk = (probabilities[0] ?? 0) - (probabilities[1] ?? 0) >= TAXONOMY_ASSIGN_RELATIVE_MARGIN

  if (absoluteOk && relativeOk) {
    const top = topK[0]
    if (top) {
      return { method: "centroid_online", clusterId: top.cluster.id, confidence: topSimilarity }
    }
  }

  return { method: "noise", clusterId: null, confidence: topSimilarity }
}

export const decideClusterAssignmentUseCase = (input: DecideClusterAssignmentInput) =>
  Effect.gen(function* () {
    const decision = decideClusterAssignment(input.topK)
    const top1 = input.topK[0]?.cosine ?? 0
    const top2 = input.topK[1]?.cosine ?? 0
    yield* Effect.annotateCurrentSpan("taxonomy.assign.topk.cosine.top1", top1)
    yield* Effect.annotateCurrentSpan("taxonomy.assign.topk.cosine.top2", top2)
    yield* Effect.annotateCurrentSpan("taxonomy.assign.topk.cosine.spread", top1 - top2)
    yield* Effect.annotateCurrentSpan("taxonomy.assign.outcome", decision.method)
    return decision
  }).pipe(Effect.withSpan("taxonomy.decideClusterAssignment"))
