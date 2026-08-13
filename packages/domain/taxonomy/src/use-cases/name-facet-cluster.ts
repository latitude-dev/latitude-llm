/**
 * Names one cluster of a facet's scoped tree (whole-project or cohort×facet).
 *
 * Shares all naming logic (prompts, collision guard, deepest-first ordering)
 * with the topic taxonomy via `nameClusterCore`; this wrapper only supplies the
 * facet-scoped naming source: siblings/children from the `(customBehaviorId,
 * facetId)`-scoped cluster tree, member summaries from the extracted answers in
 * `taxonomy_facet_projections` (via the `taxonomy_view_assignments` slice), and
 * the facet's own naming policy. It never reads or writes the topic tree.
 */

import type { CustomBehaviorId, FacetId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyFacet } from "../entities/facet.ts"
import { TaxonomyViewAssignmentRepository } from "../ports/taxonomy-view-assignment-repository.ts"
import { facetNamingPolicy, nameClusterCore } from "./name-taxonomy.ts"

export interface NameFacetClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** The facet; its `name` + `instructions` drive the per-tree naming policy. */
  readonly facet: Pick<TaxonomyFacet, "id" | "name" | "instructions">
  /** The wrapping behavior — every facet view is a custom behavior (whole-project or cohort). */
  readonly customBehaviorId: CustomBehaviorId
  readonly clusterId: TaxonomyCluster["id"]
  readonly now?: Date
  /** The gardening run; scopes contrastive sibling-set naming to this pass. */
  readonly namingPassId?: string
}

export const nameFacetClusterUseCase = (input: NameFacetClusterInput) =>
  Effect.gen(function* () {
    const assignments = yield* TaxonomyViewAssignmentRepository
    const facetId: FacetId = input.facet.id
    return yield* nameClusterCore(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: input.clusterId,
        ...(input.now ? { now: input.now } : {}),
        ...(input.namingPassId ? { namingPassId: input.namingPassId } : {}),
      },
      {
        customBehaviorId: input.customBehaviorId,
        facetId,
        policy: facetNamingPolicy(input.facet),
        listMembers: (params) =>
          assignments.listClusterMemberObservations({
            ...params,
            customBehaviorId: input.customBehaviorId,
            facetId,
          }),
      },
    )
  }).pipe(Effect.withSpan("taxonomy.nameFacetCluster"))
