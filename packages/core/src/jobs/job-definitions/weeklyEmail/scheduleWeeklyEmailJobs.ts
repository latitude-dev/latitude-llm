import { Job } from 'bullmq'
import { getActiveWorkspacesForWeeklyEmail } from '../../../data-access/weeklyEmail/activeWorkspaces'
import { queues } from '../../queues'

export type ScheduleWeeklyEmailJobsData = Record<string, never>

/**
 * Job that runs weekly (Monday at 1:00 AM) to schedule weekly email jobs.
 *
 * This job:
 * 1. Finds all workspaces with prompt span activity in the last 4 weeks
 * 2. Excludes workspaces marked as big accounts (isBigAccount = true)
 * 3. Enqueues individual sendWeeklyEmailJob for each active workspace
 *    on the notifications queue (rate-limited to 90/minute for Mailgun)
 */
export const scheduleWeeklyEmailJobs = async (
  _: Job<ScheduleWeeklyEmailJobsData>,
) => {
  const { notificationsQueue } = await queues()
  const activeWorkspaces = await getActiveWorkspacesForWeeklyEmail()

  for (const workspace of activeWorkspaces) {
    await notificationsQueue.add(
      'sendWeeklyEmailJob',
      { workspaceId: workspace.id },
      { attempts: 3 },
    )
  }
}
