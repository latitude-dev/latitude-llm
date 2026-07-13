/**
 * Deprecates every active cluster in a custom behavior's scoped sub-tree.
 *
 * The failure-cleanup counterpart to `buildCustomBehaviorTaxonomyUseCase`: a
 * scoped build saves clusters `active` (and continuations upsert prior rows in
 * place) before naming and the quality gate run, so a mid-run failure would
 * otherwise leave a half-named tree active under the `customBehaviorId`, mixed
 * into the next regeneration's lineage match. Deprecating the scoped tree on
 * failure gives the next run a clean slate. It never touches the global tree
 * (custom_behavior_id IS NULL) or another behavior's scope.
 */

import type { CustomBehaviorId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface DeprecateCustomBehaviorTreeInput {
  readonly projectId: ProjectId
  readonly customBehaviorId: CustomBehaviorId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export const deprecateCustomBehaviorTreeUseCase = (input: DeprecateCustomBehaviorTreeInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.customBehaviorId", input.customBehaviorId)
    const timestamp = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const clusters = yield* TaxonomyClusterRepository
    const active = yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension,
      customBehaviorId: input.customBehaviorId,
    })
    for (const cluster of active) {
      yield* clusters.markDeprecated({ clusterId: cluster.id, timestamp })
    }
    return { clustersDeprecated: active.length }
  }).pipe(Effect.withSpan("taxonomy.deprecateCustomBehaviorTree"))
