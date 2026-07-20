import type { TaxonomyClusterLineage } from "@domain/taxonomy"
import { CancellationScope, deprecatePatch, patched, proxyActivities, workflowInfo } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type GardenTaxonomyWorkflowInput = activities.GardenTaxonomyActivityInput
export type GardenTaxonomyWorkflowResult = activities.GardenTaxonomyActivityResult

/**
 * v2 gardening: a single divisive top-down build pass produces the whole
 * tree, then per-cluster naming fills in human-readable names. There is no
 * sweep / merge / recurse loop — the build pass is internally hierarchical
 * and sibling-similarity-aware.
 *
 * One workflow, two scopes. Global gardening (no `customBehaviorId`) rebuilds
 * the project-wide tree and writes membership to
 * `taxonomy_observations.assigned_cluster_id`; a scoped run (a custom behavior's
 * `customBehaviorId`) rebuilds that behavior's sub-tree and writes the
 * `custom_behavior_assignments` slice. Scope is threaded as an optional field
 * global omits, and every branch lives inside the activities/use-cases, so the
 * global activity sequence, names, and serialized inputs are byte-identical to
 * the pre-unification workflow.
 */
const {
  assertGardenTaxonomyQualityActivity,
  cleanupGardenTaxonomyStagingActivity,
  completeGardenTaxonomyRunActivity,
  deprecateGardenTaxonomyClustersActivity,
  emitGardenTaxonomyLineageActivity,
  failGardenTaxonomyRunActivity,
  planGardenTaxonomyNamingActivity,
  planHierarchicalGardenTaxonomyActivity,
  reassignGardenTaxonomyObservationsActivity,
  saveGardenTaxonomyClustersActivity,
  startGardenTaxonomyRunActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "1 minute",
    maximumInterval: "30 minutes",
    // A staged plan lost from Redis (eviction, flush) cannot reappear; fail fast and let the next sweep rebuild.
    nonRetryableErrorTypes: ["TaxonomyGardeningPlanMissingError"],
  },
})

const { nameTaxonomyClusterActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "30 seconds",
    maximumInterval: "5 minutes",
  },
})

// Naming runs one cluster at a time. nameTaxonomyClusterActivity reads its
// already-named siblings to build the forbidden-name list its collision guard
// enforces; siblings named concurrently each still see the other as "Pending"
// and can collide, which the sibling-duplicate quality gate then rejects.
// Sequential naming guarantees each sibling sees the ones named before it.
const NAMING_ACTIVITY_CONCURRENCY = 1

const runInBatches = async <A, B>(
  items: readonly A[],
  batchSize: number,
  run: (item: A) => Promise<B>,
): Promise<readonly B[]> => {
  const results: B[] = []
  for (let offset = 0; offset < items.length; offset += batchSize) {
    results.push(...(await Promise.all(items.slice(offset, offset + batchSize).map(run))))
  }
  return results
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

export const gardenTaxonomyWorkflow = async (
  input: GardenTaxonomyWorkflowInput,
): Promise<GardenTaxonomyWorkflowResult> => {
  // The staging + atomic-swap publish shape (the mode-gated reassign/deprecate
  // activities and the failure-path staging cleanup) is a new activity shape.
  // The command SEQUENCE stays mode-independent — activities branch on mode
  // internally — so this single marker reconciles an in-flight pre-change
  // history at a fixed position. Read once, before the try, so the catch path
  // sees the same deterministic value.
  let useStagingSwap = false
  try {
    const started = await startGardenTaxonomyRunActivity({ ...input, workflowRunId: workflowInfo().runId })
    // Split-build is unconditional now; deprecatePatch sits right after start
    // (where the old `patched("…-split-build-v1")` gate did) so replay of in-flight
    // split-build histories reconciles the marker at the same position.
    deprecatePatch("taxonomy-gardening-split-build-v1")
    useStagingSwap = patched("taxonomy-gardening-staging-swap-v1")
    const built = await planHierarchicalGardenTaxonomyActivity(started)
    // Scoped cold-start: the plan sampled below the gardening minimum and built
    // no tree, so complete the run empty and leave any prior scoped tree serving
    // (never reaching save/deprecate). Global stays on the full sequence — the
    // sweep gates it on the same minimum before it ever starts.
    if (started.customBehaviorId !== undefined && built.clustersBorn === 0 && built.clustersContinued === 0) {
      return await completeGardenTaxonomyRunActivity({
        ...started,
        observationsScanned: built.observationsScanned,
        observationsAvailable: built.observationsAvailable,
        observationsSampled: built.observationsSampled,
        sampleStrategy: built.sampleStrategy,
        sampleCap: built.sampleCap,
        noiseScanned: 0,
        clustersBorn: 0,
        clustersMerged: 0,
        clustersDeprecated: 0,
      })
    }
    await saveGardenTaxonomyClustersActivity({ ...started, planKey: built.planKey })
    await reassignGardenTaxonomyObservationsActivity({ ...started, planKey: built.planKey })
    await deprecateGardenTaxonomyClustersActivity({ ...started, planKey: built.planKey })
    const lineage: TaxonomyClusterLineage[] = [...built.lineage]
    const namingPlan = await planGardenTaxonomyNamingActivity({ ...started, lineage })
    // Name depth by depth, deepest first, and sequentially within a depth
    // (see NAMING_ACTIVITY_CONCURRENCY). We await all of a depth before naming
    // the parents above it so each interior sees its children's final names.
    for (const { clusterIds } of namingPlan.clusterIdsByDepth) {
      await runInBatches(clusterIds, NAMING_ACTIVITY_CONCURRENCY, (clusterId) =>
        nameTaxonomyClusterActivity({
          organizationId: started.organizationId,
          projectId: started.projectId,
          clusterId,
          ...(started.customBehaviorId ? { customBehaviorId: started.customBehaviorId } : {}),
        }),
      )
    }
    await assertGardenTaxonomyQualityActivity(started)
    await emitGardenTaxonomyLineageActivity({ ...started, lineage })
    return await completeGardenTaxonomyRunActivity({
      ...started,
      observationsScanned: built.observationsAvailable ?? built.observationsScanned ?? 0,
      observationsAvailable: built.observationsAvailable ?? built.observationsScanned ?? 0,
      observationsSampled: built.observationsSampled ?? built.observationsScanned ?? 0,
      sampleStrategy: built.sampleStrategy ?? "legacy_full_build",
      sampleCap: built.sampleCap ?? built.observationsScanned ?? 0,
      noiseScanned: 0,
      clustersBorn: built.clustersBorn,
      clustersMerged: 0,
      clustersDeprecated: built.clustersDeprecated,
    })
  } catch (error) {
    // Fail from the raw input, not `started`: the scoped start activity flips the
    // behavior to `generating` up front, so a start-activity failure must still
    // mark it failed instead of leaving it stuck generating. The fail activity
    // re-derives the (deterministic) run id from the input.
    await CancellationScope.nonCancellable(async () => {
      // A publish that failed before the swap leaves an orphaned staging tree;
      // remove it so the old tree stays the only active one. No-op on off runs
      // and when the swap already completed (guarded to state='staging').
      if (useStagingSwap) {
        await cleanupGardenTaxonomyStagingActivity({ ...input, workflowRunId: workflowInfo().runId })
      }
      await failGardenTaxonomyRunActivity({ ...input, workflowRunId: workflowInfo().runId, error: errorMessage(error) })
    })
    throw error
  }
}
