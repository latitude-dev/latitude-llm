import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_ASSIGN_TOPK } from "../constants.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface FindNearestClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly queryVector: readonly number[]
  readonly k?: number
}

export const findNearestClustersUseCase = (input: FindNearestClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const repository = yield* TaxonomyClusterRepository
    return yield* repository.listNearestActive({
      projectId: input.projectId,
      dimension: "topic",
      queryVector: input.queryVector,
      k: input.k ?? TAXONOMY_ASSIGN_TOPK,
    })
  }).pipe(Effect.withSpan("taxonomy.findNearestClusters"))
