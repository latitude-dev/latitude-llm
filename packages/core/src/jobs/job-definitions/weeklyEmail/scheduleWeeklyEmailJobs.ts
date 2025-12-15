import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { asc, like } from 'drizzle-orm'
import { database } from '../../../client'
import { getActiveWorkspacesForWeeklyEmail } from '../../../data-access/weeklyEmail/activeWorkspaces'
import { publisher } from '../../../events/publisher'
import { users } from '../../../schema/models/users'
import { queues } from '../../queues'

export type ScheduleWeeklyEmailJobsData = Record<string, never>

async function getFirstLatitudeEmail(db = database) {
  const result = await db
    .select({ email: users.email })
    .from(users)
    .where(like(users.email, `%@${env.APP_DOMAIN}`))
    .orderBy(asc(users.createdAt))
    .limit(1)

  return result[0]?.email ?? null
}

/**
 * Job that runs weekly (Monday at 1:00 AM) to schedule weekly email jobs.
 *
 * This job:
 * 1. Finds all workspaces with prompt span activity in the last 4 weeks
 * 2. Excludes workspaces marked as big accounts (isBigAccount = true)
 * 3. Enqueues individual sendWeeklyEmailJob for each active workspace
 *    on the notifications queue (rate-limited to 90/minute for Mailgun)
 * 4. Publishes weeklyWorkspacesNotifiedTotal event for analytics
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

  const userEmail = await getFirstLatitudeEmail()
  if (userEmail) {
    publisher.publishLater({
      type: 'weeklyWorkspacesNotifiedTotal',
      data: {
        userEmail,
        numberOfWorkspaces: activeWorkspaces.length,
      },
    })
  }
}
