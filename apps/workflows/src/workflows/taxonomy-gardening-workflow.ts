import type { TaxonomyClusterLineage } from "@domain/taxonomy"
import { CancellationScope, proxyActivities, workflowInfo } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type GardenTaxonomyWorkflowInput = activities.GardenTaxonomyActivityInput
export type GardenTaxonomyWorkflowResult = activities.GardenTaxonomyActivityResult

/**
 * v2 gardening: a single divisive top-down build pass produces the whole
 * tree, then per-cluster naming fills in human-readable names. There is no
 * sweep / merge / recurse loop — the build pass is internally hierarchical
 * and sibling-similarity-aware.
 */
const {
  assertGardenTaxonomyQualityActivity,
  buildHierarchicalGardenTaxonomyActivity,
  completeGardenTaxonomyRunActivity,
  emitGardenTaxonomyLineageActivity,
  failGardenTaxonomyRunActivity,
  planGardenTaxonomyNamingActivity,
  startGardenTaxonomyRunActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "1 minute",
    maximumInterval: "30 minutes",
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
  const started = await startGardenTaxonomyRunActivity({ ...input, workflowRunId: workflowInfo().runId })
  try {
    const built = await buildHierarchicalGardenTaxonomyActivity(started)
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
        }),
      )
    }
    await assertGardenTaxonomyQualityActivity(started)
    await emitGardenTaxonomyLineageActivity({ ...started, lineage })
    return completeGardenTaxonomyRunActivity({
      ...started,
      noiseScanned: 0,
      clustersBorn: built.clustersBorn,
      clustersMerged: 0,
      clustersDeprecated: built.clustersDeprecated,
    })
  } catch (error) {
    await CancellationScope.nonCancellable(() =>
      failGardenTaxonomyRunActivity({ ...started, error: errorMessage(error) }),
    )
    throw error
  }
}
