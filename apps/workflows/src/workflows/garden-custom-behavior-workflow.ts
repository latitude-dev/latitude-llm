import { CancellationScope, proxyActivities, workflowInfo } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type GardenCustomBehaviorWorkflowInput = activities.GardenCustomBehaviorActivityInput
export type GardenCustomBehaviorWorkflowResult = activities.GardenCustomBehaviorResult

/**
 * Scoped variant of `gardenTaxonomyWorkflow`: samples the sessions a custom
 * behavior's filterSet selects (over the lookback window), clusters their
 * taxonomy observations into a sub-tree tagged with `custom_behavior_id`, and
 * writes scoped assignments to the ClickHouse `custom_behavior_assignments`
 * slice. It never mutates the global taxonomy.
 *
 * Regenerate lifecycle: the new tree is saved and its assignments written
 * BEFORE any prior scoped cluster is deprecated — deprecation of the prior tree
 * is the last step and runs only once naming and the quality gate pass. Because
 * the build saves clusters active up front (and continuations upsert prior rows
 * in place), a failure *after* the build persisted a tree can't leave the prior
 * tree pristine; the catch path then deprecates the whole active scoped tree, so
 * that run leaves no active scoped tree and the next run rebuilds from scratch. A
 * failure at or before the build writes anything (start error, sampling error,
 * cold-start gate) skips that cleanup and leaves any prior tree serving.
 */
const {
  assertGardenCustomBehaviorQualityActivity,
  buildGardenCustomBehaviorTaxonomyActivity,
  cleanupGardenCustomBehaviorClustersActivity,
  completeGardenCustomBehaviorRunActivity,
  deprecateGardenCustomBehaviorClustersActivity,
  failGardenCustomBehaviorRunActivity,
  planGardenCustomBehaviorNamingActivity,
  startGardenCustomBehaviorRunActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "1 minute",
    maximumInterval: "30 minutes",
  },
})

const { nameGardenCustomBehaviorClusterActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "30 seconds",
    maximumInterval: "5 minutes",
  },
})

// Naming runs one cluster at a time so each sibling sees the names assigned
// before it (its collision guard reads already-named siblings).
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

export const gardenCustomBehaviorWorkflow = async (
  input: GardenCustomBehaviorWorkflowInput,
): Promise<GardenCustomBehaviorWorkflowResult> => {
  // True once the build has persisted a scoped tree. Only then does a
  // later-step failure need the cleanup deprecate — a failure at or before the
  // build wrote anything (start error, sampling error, cold-start gate) must
  // leave any prior scoped tree serving.
  let treePersisted = false
  try {
    const started = await startGardenCustomBehaviorRunActivity({
      ...input,
      workflowRunId: workflowInfo().runId,
    })
    const built = await buildGardenCustomBehaviorTaxonomyActivity(started)
    if (built.outcome === "insufficient_observations") {
      // Cold-start gate not met: prior scoped tree (if any) is left untouched.
      return await failGardenCustomBehaviorRunActivity({
        ...input,
        error: "insufficient matching observations to build a scoped taxonomy",
        observationsSampled: built.observationsSampled,
      })
    }
    treePersisted = true

    const namingPlan = await planGardenCustomBehaviorNamingActivity(started)
    for (const { clusterIds } of namingPlan.clusterIdsByDepth) {
      await runInBatches(clusterIds, NAMING_ACTIVITY_CONCURRENCY, (clusterId) =>
        nameGardenCustomBehaviorClusterActivity({
          organizationId: started.organizationId,
          projectId: started.projectId,
          customBehaviorId: started.customBehaviorId,
          clusterId,
        }),
      )
    }

    await assertGardenCustomBehaviorQualityActivity(started)
    // Deprecate prior scoped clusters only now that the new pass has succeeded.
    await deprecateGardenCustomBehaviorClustersActivity({
      ...started,
      clusterIds: built.deprecatedClusterIds,
    })

    return await completeGardenCustomBehaviorRunActivity({
      ...started,
      observationsSampled: built.observationsSampled,
      clustersBorn: built.clustersBorn,
      clustersContinued: built.clustersContinued,
      clustersDeprecated: built.deprecatedClusterIds.length,
    })
  } catch (error) {
    await CancellationScope.nonCancellable(async () => {
      // Deprecate the scoped tree only when the build actually persisted one, so
      // it doesn't pollute the next run's lineage match. A failure at/before the
      // build leaves the prior tree serving. Best-effort (the activity logs its
      // own failure) so cleanup never masks the original error or blocks marking
      // the behavior failed.
      if (treePersisted) {
        await cleanupGardenCustomBehaviorClustersActivity(input).catch(() => undefined)
      }
      await failGardenCustomBehaviorRunActivity({
        ...input,
        error: errorMessage(error),
      })
    })
    throw error
  }
}
