import { log, ParentClosePolicy, proxyActivities, startChild } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { gardenProjectWorkflow } from "./garden-project-workflow.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

/**
 * Scheduled fan-out: enumerate projects past the cold-start gate and start one
 * `gardenProjectWorkflow` per project. Replaces the BullMQ `gardenSweep` cron.
 *
 * Children use ABANDON + a per-project workflow id, so a still-running
 * gardening execution from a prior tick dedupes the new start (the workflow-id
 * uniqueness that replaced the project garden lock). The schedule's SKIP
 * overlap policy already prevents two sweeps overlapping.
 */
const { listEligibleProjectsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: defaultActivityRetryPolicy,
})

export interface GardenSweepWorkflowResult {
  readonly action: "swept"
  readonly projectsEligible: number
  readonly projectsStarted: number
}

export const gardenSweepWorkflow = async (): Promise<GardenSweepWorkflowResult> => {
  const nowIso = new Date().toISOString()
  const eligible = await listEligibleProjectsActivity({ nowIso })

  let projectsStarted = 0
  for (const project of eligible) {
    try {
      await startChild(gardenProjectWorkflow, {
        workflowId: `org:${project.organizationId}:taxonomy:garden:${project.projectId}`,
        args: [{ organizationId: project.organizationId, projectId: project.projectId, trigger: "cron" as const }],
        parentClosePolicy: ParentClosePolicy.ABANDON,
      })
      projectsStarted++
    } catch (error) {
      // A gardening run for this project is already in flight — skip it.
      log.info("skipped garden project child (already in flight)", {
        organizationId: project.organizationId,
        projectId: project.projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { action: "swept", projectsEligible: eligible.length, projectsStarted }
}
