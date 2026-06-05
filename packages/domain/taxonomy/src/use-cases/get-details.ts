import { NotFoundError, type OrganizationId, type ProjectId, type TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

export interface GetClusterDetailsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  readonly sampleSize?: number
}

export interface GetClusterDetailsResult {
  readonly cluster: TaxonomyCluster
  readonly recentObservations: readonly TaxonomyMomentObservation[]
}

const clampLimit = (value: number | undefined, fallback: number, max: number): number =>
  Math.min(Math.max(value ?? fallback, 1), max)

export const getClusterDetailsUseCase = (input: GetClusterDetailsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* TaxonomyObservationRepository
    const cluster = yield* clusters.findById(input.clusterId)
    if (cluster.organizationId !== input.organizationId || cluster.projectId !== input.projectId) {
      return yield* new NotFoundError({ entity: "TaxonomyCluster", id: input.clusterId })
    }
    const recentObservations = yield* observations.listByCluster({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      limit: clampLimit(input.sampleSize, 5, 20),
    })
    return { cluster, recentObservations } satisfies GetClusterDetailsResult
  }).pipe(Effect.withSpan("taxonomy.getClusterDetails"))
