import type { TaxonomyClusterLineage } from "@domain/taxonomy"
import { CancellationScope, proxyActivities, workflowInfo } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type GardenTaxonomyWorkflowInput = activities.GardenTaxonomyActivityInput
export type GardenTaxonomyWorkflowResult = activities.GardenTaxonomyActivityResult

const {
  assertGardenTaxonomyQualityActivity,
  calibrateGardenTaxonomyActivity,
  completeGardenTaxonomyRunActivity,
  deprecateGardenTaxonomyClustersActivity,
  emitGardenTaxonomyLineageActivity,
  failGardenTaxonomyRunActivity,
  mergeGardenTaxonomyClustersActivity,
  planGardenTaxonomyNamingActivity,
  reassignGardenTaxonomyNoiseActivity,
  reconcileGardenTaxonomyCountsActivity,
  recurseGardenTaxonomyTreeActivity,
  startGardenTaxonomyRunActivity,
  sweepGardenTaxonomyNoiseActivity,
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

const NAMING_ACTIVITY_CONCURRENCY = 4
const GARDENING_CONVERGENCE_MAX_ITERATIONS = 3
const GARDENING_ITERATION_OFFSET_MS = 10

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
    await calibrateGardenTaxonomyActivity(started)
    const lineage: TaxonomyClusterLineage[] = []
    let noiseScanned = 0
    let clustersBorn = 0
    let clustersMerged = 0
    let clustersDeprecated = 0

    for (let iteration = 0; iteration < GARDENING_CONVERGENCE_MAX_ITERATIONS; iteration += 1) {
      const step = {
        ...started,
        now: new Date(Date.parse(started.now) + iteration * GARDENING_ITERATION_OFFSET_MS).toISOString(),
      }
      const births = await sweepGardenTaxonomyNoiseActivity(step)
      const reassign = await reassignGardenTaxonomyNoiseActivity(step)
      const recursion = await recurseGardenTaxonomyTreeActivity(step)
      const iterationLineage = [...births.lineage, ...recursion.lineage]
      const namingPlan = await planGardenTaxonomyNamingActivity({ ...step, lineage: iterationLineage })
      await runInBatches(namingPlan.clusterIds, NAMING_ACTIVITY_CONCURRENCY, (clusterId) =>
        nameTaxonomyClusterActivity({
          organizationId: started.organizationId,
          projectId: started.projectId,
          clusterId,
        }),
      )
      const merges = await mergeGardenTaxonomyClustersActivity(step)
      const reconciliation = await reconcileGardenTaxonomyCountsActivity(step)
      const deaths = await deprecateGardenTaxonomyClustersActivity(step)
      lineage.push(...iterationLineage, ...merges.lineage, ...reconciliation.lineage, ...deaths.lineage)
      noiseScanned += births.noiseScanned + reassign.noiseScanned
      clustersBorn += births.clustersBorn + recursion.childrenBorn
      clustersMerged += merges.clustersMerged
      clustersDeprecated += reconciliation.clustersDeprecated + deaths.clustersDeprecated

      if (
        births.clustersBorn === 0 &&
        recursion.childrenBorn === 0 &&
        merges.clustersMerged === 0 &&
        reconciliation.clustersDeprecated === 0
      ) {
        break
      }
    }

    await assertGardenTaxonomyQualityActivity(started)
    await emitGardenTaxonomyLineageActivity({ ...started, lineage })
    return completeGardenTaxonomyRunActivity({
      ...started,
      noiseScanned,
      clustersBorn,
      clustersMerged,
      clustersDeprecated,
    })
  } catch (error) {
    await CancellationScope.nonCancellable(() =>
      failGardenTaxonomyRunActivity({ ...started, error: errorMessage(error) }),
    )
    throw error
  }
}
