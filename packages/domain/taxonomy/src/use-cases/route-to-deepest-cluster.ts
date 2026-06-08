import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import {
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_ASSIGN_RELATIVE_MARGIN,
  TAXONOMY_ASSIGN_TOPK,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyDimension } from "../entities/dimension.ts"
import { type NearestClusterMatch, TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import {
  type ClusterAssignmentDecision,
  type ClusterAssignmentGates,
  decideClusterAssignment,
} from "./decide-cluster-assignment.ts"

export interface RouteToDeepestClusterInput {
  readonly projectId: ProjectId
  readonly dimension: TaxonomyDimension
  readonly queryVector: readonly number[]
  readonly gates?: ClusterAssignmentGates
}

/**
 * Deepest-fit tree routing: start at the roots and descend while a child
 * clears the gates; the observation lands on the deepest node that did.
 * If a child does not clear the gates, the observation stays on the matched
 * parent as that subtree's residue for future recursion. Descent into a
 * recursed node's children additionally
 * requires the density that node was split at — the global absolute gate is
 * tuned for root-level coarseness and would otherwise descend into
 * tight children on marginal similarity.
 */
export const routeToDeepestClusterUseCase = (input: RouteToDeepestClusterInput) =>
  Effect.gen(function* () {
    const clusters = yield* TaxonomyClusterRepository
    const baseGates: ClusterAssignmentGates = {
      absoluteThreshold: input.gates?.absoluteThreshold ?? TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
      relativeMargin: input.gates?.relativeMargin ?? TAXONOMY_ASSIGN_RELATIVE_MARGIN,
    }
    let parent: TaxonomyCluster | null = null
    let decision: ClusterAssignmentDecision = decideClusterAssignment([], baseGates)
    for (;;) {
      const nearest: readonly NearestClusterMatch[] = yield* clusters.listNearestActive({
        projectId: input.projectId,
        dimension: input.dimension,
        queryVector: input.queryVector,
        k: TAXONOMY_ASSIGN_TOPK,
        parentClusterId: parent === null ? null : parent.id,
      })
      const levelGates =
        parent?.splitLinkThreshold == null
          ? baseGates
          : {
              absoluteThreshold: Math.max(baseGates.absoluteThreshold, parent.splitLinkThreshold),
              relativeMargin: baseGates.relativeMargin,
            }
      const levelDecision = decideClusterAssignment(nearest, levelGates)
      if (levelDecision.method !== "centroid_online") {
        break
      }
      decision = levelDecision
      const match = nearest.find((candidate) => candidate.cluster.id === levelDecision.clusterId)
      if (!match) break
      parent = match.cluster
    }
    return decision
  }).pipe(Effect.withSpan("taxonomy.routeToDeepestCluster"))
