import type { OrganizationId, ProjectId, TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_NOISE_LOOKBACK_DAYS } from "../constants.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { assignObservationToClusterUseCase } from "./assign-observation-to-cluster.ts"
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
      const topK = yield* clusters.listNearestActive({
        organizationId: input.organizationId,
        projectId: input.projectId,
        queryVector: observation.embedding,
        k: 10,
      })
      const decision = decideClusterAssignment(topK)
      if (decision.method !== "centroid_online") continue

      yield* assignObservationToClusterUseCase({
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: decision.clusterId,
        embedding: observation.embedding,
        observedAt: observation.startTime,
        assignedAt: now,
      })
      yield* observations.reassignMany([
        {
          observation,
          assignedClusterId: topK[0]?.cluster.id ?? decision.clusterId,
          assignmentMethod: "gardening_reassign",
          assignmentConfidence: decision.confidence,
          reassignmentRunId: input.runId,
          indexedAt: now,
        },
      ])
      observationsReassigned++
    }

    return { noiseScanned: noise.length, observationsReassigned } satisfies ReassignNoiseToCurrentClustersResult
  }).pipe(Effect.withSpan("taxonomy.reassignNoiseToCurrentClusters"))
