import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { Job } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { getPlansWithLimitedRetention } from '../../../plans'
import { database } from '../../../client'
import { queues } from '../../queues'

export type ScheduleWorkspaceCleanupJobsData = Record<string, never>

/**
 * Job that runs nightly to schedule cleanup jobs for workspaces with limited retention.
 *
 * This job:
 * 1. Finds all workspaces with plans that have limited retention (free plans and TeamV4)
 * 2. Enqueues individual cleanup jobs for each workspace
 * 3. Each cleanup job will delete document logs and provider logs older than the plan's retention period
 */
export const scheduleWorkspaceCleanupJobs = async (
  _: Job<ScheduleWorkspaceCleanupJobsData>,
) => {
  const limitedRetentionPlans = getPlansWithLimitedRetention()
  const { maintenanceQueue } = await queues()
  // Find all workspaces with limited retention plans
  const workspacesWithLimitedRetention = await database
    .select({
      id: workspaces.id,
    })
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(subscriptions.id, workspaces.currentSubscriptionId),
    )
    .where(inArray(subscriptions.plan, limitedRetentionPlans))
    .then((r) => r)

  let _enqueuedJobs = 0

  // Enqueue individual cleanup job for each workspace with limited retention
  for (const workspace of workspacesWithLimitedRetention) {
    await maintenanceQueue.add(
      'cleanupWorkspaceOldLogsJob',
      { workspaceId: workspace.id },
      { attempts: 3 },
    )
    _enqueuedJobs++
  }
}
