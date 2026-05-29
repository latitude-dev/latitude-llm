import { type OrganizationId, type ProjectId, TaxonomyClusterId, type TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_CLUSTER_LOCK_TTL_SECONDS, TAXONOMY_NOISE_LOOKBACK_DAYS } from "../constants.ts"
import { updateTaxonomyCentroid } from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { decideClusterAssignment } from "./decide-cluster-assignment.ts"

export interface ReassignNoiseToCurrentClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly now?: Date
}

export interface ReassignNoiseToCurrentClustersResult {
  readonly noiseScanned: number
  readonly observationsReassigned: number
}

const lookbackStart = (now: Date): Date => new Date(now.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

export const reassignNoiseToCurrentClustersUseCase = (input: ReassignNoiseToCurrentClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const observations = yield* BehaviorObservationRepository
    const clusters = yield* TaxonomyClusterRepository
    const noise = yield* observations.listNoise({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since: lookbackStart(now),
    })

    let observationsReassigned = 0
    for (const observation of noise) {
      // listNoise's filter is the source of truth, but the snapshot can race
      // with an online assignment — re-check before mutating cluster state.
      if (observation.assignedClusterId !== null) continue

      const topK = yield* clusters.listNearestActive({
        projectId: input.projectId,
        queryVector: observation.embedding,
        k: 10,
      })
      const decision = decideClusterAssignment(topK)
      if (decision.method !== "centroid_online") continue

      const clusterId = TaxonomyClusterId(decision.clusterId)
      yield* withTaxonomyClusterLock(
        { organizationId: input.organizationId, clusterId, ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS },
        Effect.gen(function* () {
          const cluster = yield* clusters.findById(clusterId)
          const centroid = updateTaxonomyCentroid({
            centroid: { ...cluster.centroid, clusteredAt: cluster.clusteredAt },
            embedding: observation.embedding,
            weight: 1,
            timestamp: observation.startTime,
            operation: "add",
            previousClusteredAt: cluster.clusteredAt,
          })
          yield* clusters.save({
            ...cluster,
            centroid,
            clusteredAt: centroid.clusteredAt,
            observationCount: cluster.observationCount + 1,
            lastObservedAt:
              observation.startTime > cluster.lastObservedAt ? observation.startTime : cluster.lastObservedAt,
            updatedAt: now,
          })
          yield* observations.reassignMany([
            {
              observation,
              assignedClusterId: clusterId,
              assignmentMethod: "gardening_reassign",
              assignmentConfidence: decision.confidence,
              reassignmentRunId: input.runId,
              indexedAt: now,
            },
          ])
        }),
      )
      observationsReassigned++
    }

    return { noiseScanned: noise.length, observationsReassigned } satisfies ReassignNoiseToCurrentClustersResult
  }).pipe(Effect.withSpan("taxonomy.reassignNoiseToCurrentClusters"))
