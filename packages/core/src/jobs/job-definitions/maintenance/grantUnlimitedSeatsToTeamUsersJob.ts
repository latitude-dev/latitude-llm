import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { Job } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { SubscriptionPlan } from '../../../plans'
import { database } from '../../../client'
import { queues } from '../../queues'

export type GrantUnlimitedSeatsToTeamUsersJobData = Record<string, never>

export const grantUnlimitedSeatsToTeamUsersJob = async (
  _: Job<GrantUnlimitedSeatsToTeamUsersJobData>,
) => {
  try {
    const teamPlans = [SubscriptionPlan.TeamV1, SubscriptionPlan.TeamV2]

    const teamWorkspaces = await database
      .select({
        id: workspaces.id,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(inArray(subscriptions.plan, teamPlans))
      .then((r) => r)

    let _enqueuedJobs = 0

    for (const workspace of teamWorkspaces) {
      try {
        const { maintenanceQueue } = await queues()
        await maintenanceQueue.add(
          'grantUnlimitedSeatsToWorkspaceJob',
          { workspaceId: workspace.id },
          { attempts: 3 },
        )
        _enqueuedJobs++
      } catch (error) {
        console.error(
          `Failed to schedule job for workspace ${workspace.id}:`,
          error,
        )
      }
    }

    console.log(
      `Scheduled unlimited seat grants for ${_enqueuedJobs} team workspaces`,
    )
  } catch (error) {
    console.error('Failed to schedule unlimited seat grants:', error)
  }
}
