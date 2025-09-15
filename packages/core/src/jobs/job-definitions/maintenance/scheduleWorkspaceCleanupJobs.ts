import { Job } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { FREE_PLANS } from '../../../plans'
import { database } from '../../../client'
import { subscriptions, workspaces } from '../../../schema'
import { queues } from '../../queues'

export type ScheduleWorkspaceCleanupJobsData = Record<string, never>

/**
 * Job that runs nightly to schedule cleanup jobs for workspaces on free plans.
 *
 * This job:
 * 1. Finds all workspaces with free plans (hobby_v1, hobby_v2)
 * 2. Enqueues individual cleanup jobs for each workspace
 * 3. Each cleanup job will delete document logs and provider logs older than 30 days
 */
export const scheduleWorkspaceCleanupJobs = async (
  _: Job<ScheduleWorkspaceCleanupJobsData>,
) => {
  // Find all workspaces with free plans
  const freeWorkspaces = await database
    .select({
      id: workspaces.id,
    })
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(subscriptions.id, workspaces.currentSubscriptionId),
    )
    .where(inArray(subscriptions.plan, FREE_PLANS))
    .then((r) => r)

  let enqueuedJobs = 0

  // Enqueue individual cleanup job for each free workspace
  for (const workspace of freeWorkspaces) {
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'cleanupWorkspaceOldLogsJob',
      { workspaceId: workspace.id },
      { attempts: 3 },
    )
    enqueuedJobs++
  }

  return {
    success: true,
    freeWorkspacesCount: freeWorkspaces.length,
    enqueuedJobs,
  }
}
