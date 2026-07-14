/**
 * Names one cluster of a custom behavior's scoped sub-tree.
 *
 * Shares all naming logic (prompts, collision guard, deepest-first ordering)
 * with the global taxonomy via `nameClusterCore`; this wrapper only supplies
 * the behavior-scoped naming source: siblings/children from the
 * `customBehaviorId`-filtered cluster tree, and member summaries from the
 * ClickHouse `custom_behavior_assignments` slice joined back to global
 * `taxonomy_observations`. It never reads or writes the global tree.
 */

import type { CustomBehaviorId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { CustomBehaviorAssignmentRepository } from "../ports/custom-behavior-assignment-repository.ts"
import { nameClusterCore } from "./name-taxonomy.ts"

export interface NameCustomBehaviorClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly customBehaviorId: CustomBehaviorId
  readonly clusterId: TaxonomyCluster["id"]
  readonly now?: Date
}

export const nameCustomBehaviorClusterUseCase = (input: NameCustomBehaviorClusterInput) =>
  Effect.gen(function* () {
    const assignments = yield* CustomBehaviorAssignmentRepository
    return yield* nameClusterCore(input, {
      customBehaviorId: input.customBehaviorId,
      listMembers: (params) =>
        assignments.listClusterMemberObservations({ ...params, customBehaviorId: input.customBehaviorId }),
    })
  }).pipe(Effect.withSpan("taxonomy.nameCustomBehaviorCluster"))
