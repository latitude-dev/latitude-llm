import { WorkflowTerminator } from "@domain/queue"
import type { CustomBehaviorId } from "@domain/shared"
import { Effect } from "effect"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { FacetProjectionRepository } from "../ports/facet-projection-repository.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyViewAssignmentRepository } from "../ports/taxonomy-view-assignment-repository.ts"
import { taxonomyGardenCustomBehaviorDedupeKey } from "./trigger-project-gardening.ts"

interface DeleteCustomBehaviorInput {
  readonly id: CustomBehaviorId
  /** Termination reason recorded on the garden workflow, for Temporal history. */
  readonly reason?: string
}

interface DeleteCustomBehaviorResult {
  readonly customBehaviorId: CustomBehaviorId
  readonly facetId: string | null
  /** True when this was the facet's last view, so the facet itself was torn down too. */
  readonly facetPurged: boolean
}

/**
 * Tear a behavior down across both stores. A behavior owns rows in four places and
 * none of them are joined by a foreign key, so each has to be named here:
 *
 *   - Postgres `taxonomy_clusters` — its scoped tree, centroids included.
 *   - ClickHouse `taxonomy_view_assignments` — its cluster membership edges.
 *   - Postgres `taxonomy_facets` + ClickHouse `taxonomy_facet_projections` — only when
 *     this was the facet's last view. A facet shared with another view keeps both, and
 *     that is what makes the extracted answers reusable instead of re-extracted.
 *   - Postgres `custom_behaviors` — the row itself, deleted last.
 *
 * Order matters. The in-flight garden is terminated first — a run that outlives the rows
 * keeps writing clusters and assignments for a behavior nothing owns any more — then
 * children go and the behavior row last, so a crash midway leaves a behavior whose tree
 * is gone (the next scheduled garden rebuilds it) rather than orphans with no owner left
 * to find them by.
 *
 * Two tables are deliberately not touched, both because they don't record which
 * behavior a row belongs to: `taxonomy_runs` has a `custom_behavior_id` column that
 * nothing populates (every run is written with it NULL), and
 * `taxonomy_cluster_lineage` has no such column at all and is read project-wide. A
 * deleted behavior's runs and transitions therefore survive in project-level history.
 */
export const deleteCustomBehavior = Effect.fn("taxonomy.deleteCustomBehavior")(function* (
  input: DeleteCustomBehaviorInput,
) {
  yield* Effect.annotateCurrentSpan("customBehaviorId", input.id)

  const behaviors = yield* CustomBehaviorRepository
  // findById is org-scoped, so a cross-org/missing id surfaces NotFoundError instead of a silent no-op.
  const view = yield* behaviors.findById(input.id)

  const terminator = yield* WorkflowTerminator
  yield* terminator.terminate(
    taxonomyGardenCustomBehaviorDedupeKey({ organizationId: view.organizationId, customBehaviorId: view.id }),
    input.reason ?? "behavior deleted",
  )

  // Decide the facet's fate BEFORE deleting anything, so the "other views?" check
  // still sees the full set.
  const facetId = view.facetId
  const facetStillUsed =
    facetId != null &&
    (yield* behaviors.listByProject({ projectId: view.projectId })).some(
      (behaviour) => behaviour.id !== view.id && behaviour.facetId === facetId,
    )

  const assignments = yield* TaxonomyViewAssignmentRepository
  yield* assignments.deleteByBehavior({
    organizationId: view.organizationId,
    projectId: view.projectId,
    customBehaviorId: view.id,
  })

  const clusters = yield* TaxonomyClusterRepository
  yield* clusters.deleteByBehavior({ projectId: view.projectId, customBehaviorId: view.id })

  if (facetId != null && !facetStillUsed) {
    const projections = yield* FacetProjectionRepository
    const facets = yield* FacetRepository
    yield* projections.deleteByFacet({ organizationId: view.organizationId, projectId: view.projectId, facetId })
    // Edges by facet as well: a facet's slices from views deleted earlier leave rows
    // that a per-behavior purge can no longer reach.
    yield* assignments.deleteByFacet({ organizationId: view.organizationId, projectId: view.projectId, facetId })
    yield* facets.delete(facetId)
  }

  yield* behaviors.delete(view.id)

  return {
    customBehaviorId: view.id,
    facetId,
    facetPurged: facetId != null && !facetStillUsed,
  } satisfies DeleteCustomBehaviorResult
})
