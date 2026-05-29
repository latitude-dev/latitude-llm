import { log, ParentClosePolicy, proxyActivities, startChild } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { runWithLockRetry } from "./lock-retry.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"
import { taxonomyNameCategoryWorkflow, taxonomyNameClusterWorkflow } from "./taxonomy-naming-workflow.ts"

/**
 * Per-project taxonomy gardening as a durable workflow. Each pipeline stage is
 * an idempotent activity, so a worker crash resumes from the last completed
 * stage instead of replaying the whole run. Mutual exclusion that the Redis
 * garden lock used to provide is now the workflow id
 * (`org:${org}:taxonomy:garden:${project}`): Temporal admits only one running
 * execution per id.
 *
 * Cluster-lock contention inside merge/reassign surfaces as
 * `{ status: "lock-unavailable" }`; `runWithLockRetry` waits it out with
 * durable workflow sleeps rather than failing the run.
 *
 * Naming is delegated to the existing `taxonomyName*Workflow` child workflows
 * (ABANDON) so a slow LLM provider can't hold the gardening run open.
 */
const {
  startGardenRunActivity,
  sweepNoiseAndBirthActivity,
  mergeClustersActivity,
  deprecateInactiveActivity,
  reassignNoiseActivity,
  rebuildHierarchyActivity,
  completeGardenRunActivity,
  failGardenRunActivity,
  listPendingNamingTargetsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: defaultActivityRetryPolicy,
})

export interface GardenProjectWorkflowInput {
  readonly organizationId: string
  readonly projectId: string
  /** Defaults to "cron" (the scheduled sweep); admin re-runs pass "manual". */
  readonly trigger?: "cron" | "manual" | "threshold"
}

export interface GardenProjectWorkflowResult {
  readonly action: "gardened"
  readonly projectId: string
  readonly runId: string
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const startNamingChild = async (
  workflow: typeof taxonomyNameClusterWorkflow | typeof taxonomyNameCategoryWorkflow,
  workflowId: string,
  input:
    | { organizationId: string; projectId: string; clusterId: string }
    | {
        organizationId: string
        projectId: string
        categoryId: string
      },
): Promise<void> => {
  try {
    // ABANDON: the rename outlives this gardening run. A same-id child still
    // in flight (rename already queued) throws here — skip it.
    await startChild(workflow as typeof taxonomyNameClusterWorkflow, {
      workflowId,
      args: [input as { organizationId: string; projectId: string; clusterId: string }],
      parentClosePolicy: ParentClosePolicy.ABANDON,
    })
  } catch (error) {
    log.info("skipped naming child (already in flight)", { workflowId, error: errorMessage(error) })
  }
}

export const gardenProjectWorkflow = async (
  input: GardenProjectWorkflowInput,
): Promise<GardenProjectWorkflowResult> => {
  const nowIso = new Date().toISOString()
  const trigger = input.trigger ?? "cron"
  const runId = await startGardenRunActivity({
    organizationId: input.organizationId,
    projectId: input.projectId,
    trigger,
    nowIso,
  })
  const stage = { organizationId: input.organizationId, projectId: input.projectId, runId, nowIso }

  try {
    const births = await sweepNoiseAndBirthActivity(stage)
    const merges = await runWithLockRetry(() => mergeClustersActivity(stage))
    const deaths = await deprecateInactiveActivity(stage)
    const reassign = await runWithLockRetry(() => reassignNoiseActivity(stage))
    const hierarchy = await rebuildHierarchyActivity(stage)

    await completeGardenRunActivity({
      organizationId: input.organizationId,
      projectId: input.projectId,
      runId,
      nowIso,
      noiseScanned: births.noiseScanned + reassign.noiseScanned,
      clustersBorn: births.clustersBorn,
      clustersMerged: merges.clustersMerged,
      clustersDeprecated: deaths.clustersDeprecated,
      categoriesRebuilt: hierarchy.categoriesRebuilt,
    })
  } catch (error) {
    await failGardenRunActivity({
      organizationId: input.organizationId,
      projectId: input.projectId,
      runId,
      error: errorMessage(error),
    })
    throw error
  }

  const pending = await listPendingNamingTargetsActivity({
    organizationId: input.organizationId,
    projectId: input.projectId,
  })
  for (const clusterId of pending.clusterIds) {
    await startNamingChild(
      taxonomyNameClusterWorkflow,
      `org:${input.organizationId}:taxonomy:nameCluster:${input.projectId}:${clusterId}`,
      { organizationId: input.organizationId, projectId: input.projectId, clusterId },
    )
  }
  for (const categoryId of pending.categoryIds) {
    await startNamingChild(
      taxonomyNameCategoryWorkflow,
      `org:${input.organizationId}:taxonomy:nameCategory:${input.projectId}:${categoryId}`,
      { organizationId: input.organizationId, projectId: input.projectId, categoryId },
    )
  }

  return { action: "gardened", projectId: input.projectId, runId }
}
