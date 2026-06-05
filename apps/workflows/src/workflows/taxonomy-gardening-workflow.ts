import { CancellationScope, executeChild, proxyActivities, workflowInfo } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type GardenTaxonomyWorkflowInput = activities.GardenTaxonomyActivityInput
export type GardenTaxonomyWorkflowResult = activities.GardenTaxonomyActivityResult

export interface GardenProjectTaxonomyWorkflowInput {
  readonly organizationId: string
  readonly projectId: string
  readonly trigger: "cron" | "manual" | "threshold"
}

export type GardenProjectTaxonomyWorkflowResult = readonly GardenTaxonomyWorkflowResult[]

const TAXONOMY_DIMENSIONS = ["topic"] as const

const {
  calibrateGardenTaxonomyActivity,
  completeGardenTaxonomyRunActivity,
  deprecateGardenTaxonomyClustersActivity,
  emitGardenTaxonomyLineageActivity,
  failGardenTaxonomyRunActivity,
  mergeGardenTaxonomyClustersActivity,
  planGardenTaxonomyNamingActivity,
  reassignGardenTaxonomyNoiseActivity,
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
  // The workflow id is fixed per project+dimension; the execution run id keeps
  // each gardening execution's taxonomy run row distinct (stable across
  // activity retries and replays within this execution).
  const started = await startGardenTaxonomyRunActivity({ ...input, workflowRunId: workflowInfo().runId })
  try {
    await calibrateGardenTaxonomyActivity(started)
    const births = await sweepGardenTaxonomyNoiseActivity(started)
    const merges = await mergeGardenTaxonomyClustersActivity(started)
    const deaths = await deprecateGardenTaxonomyClustersActivity(started)
    const reassign = await reassignGardenTaxonomyNoiseActivity(started)
    const recursion = await recurseGardenTaxonomyTreeActivity(started)
    const lineage = [...births.lineage, ...merges.lineage, ...deaths.lineage, ...recursion.lineage]
    const namingPlan = await planGardenTaxonomyNamingActivity({ ...started, lineage })
    await runInBatches(namingPlan.clusterIds, NAMING_ACTIVITY_CONCURRENCY, (clusterId) =>
      nameTaxonomyClusterActivity({
        organizationId: started.organizationId,
        projectId: started.projectId,
        clusterId,
      }),
    )
    await emitGardenTaxonomyLineageActivity({ ...started, lineage })
    return completeGardenTaxonomyRunActivity({
      ...started,
      noiseScanned: births.noiseScanned + reassign.noiseScanned,
      clustersBorn: births.clustersBorn + recursion.childrenBorn,
      clustersMerged: merges.clustersMerged,
      clustersDeprecated: deaths.clustersDeprecated,
    })
  } catch (error) {
    await CancellationScope.nonCancellable(() =>
      failGardenTaxonomyRunActivity({ ...started, error: errorMessage(error) }),
    )
    throw error
  }
}

export const gardenProjectTaxonomyWorkflow = async (
  input: GardenProjectTaxonomyWorkflowInput,
): Promise<GardenProjectTaxonomyWorkflowResult> =>
  Promise.all(
    TAXONOMY_DIMENSIONS.map((dimension) => {
      const workflowId = `org:${input.organizationId}:taxonomy:garden:${input.projectId}:${dimension}`
      return executeChild(gardenTaxonomyWorkflow, {
        args: [{ ...input, dimension, workflowId }],
        workflowId,
      })
    }),
  )
