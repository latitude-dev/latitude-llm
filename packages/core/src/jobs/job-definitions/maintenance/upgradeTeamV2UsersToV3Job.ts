import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { Job } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { SubscriptionPlan } from '../../../plans'
import { database } from '../../../client'
import { queues } from '../../queues'

export type UpgradeTeamV2UsersToV3JobData = Record<string, never>

/**
 * Job that runs daily at 11:30am CEST to schedule individual jobs for upgrading
 * all users with TeamV2 subscriptions to TeamV3.
 *
 * This job:
 * 1. Finds all workspaces with TeamV2 plans
 * 2. Enqueues individual upgrade jobs for each workspace
 * 3. Each individual job will upgrade the workspace to TeamV3 subscription
 */
export const upgradeTeamV2UsersToV3Job = async (
  _: Job<UpgradeTeamV2UsersToV3JobData>,
) => {
  try {
    const teamV2Plans = [SubscriptionPlan.TeamV2]

    const teamWorkspaces = await database
      .select({
        id: workspaces.id,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(inArray(subscriptions.plan, teamV2Plans))
      .then((r) => r)

    let _enqueuedJobs = 0

    for (const workspace of teamWorkspaces) {
      try {
        const { maintenanceQueue } = await queues()
        await maintenanceQueue.add(
          'upgradeTeamV2WorkspaceToV3Job',
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
      `Scheduled TeamV3 upgrades for ${_enqueuedJobs} TeamV2 workspaces`,
    )
  } catch (error) {
    console.error('Failed to schedule TeamV3 upgrades:', error)
  }
}
