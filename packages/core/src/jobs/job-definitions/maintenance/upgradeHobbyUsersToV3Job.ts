import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { Job } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { SubscriptionPlan } from '../../../plans'
import { database } from '../../../client'
import { queues } from '../../queues'

export type UpgradeHobbyUsersToV3JobData = Record<string, never>

/**
 * Job that runs daily at 11am CEST to schedule individual jobs for upgrading
 * all users with HobbyV1 or HobbyV2 subscriptions to HobbyV3.
 *
 * This job:
 * 1. Finds all workspaces with HobbyV1 or HobbyV2 plans
 * 2. Enqueues individual upgrade jobs for each workspace
 * 3. Each individual job will upgrade the workspace to HobbyV3 subscription
 */
export const upgradeHobbyUsersToV3Job = async (
  _: Job<UpgradeHobbyUsersToV3JobData>,
) => {
  try {
    const hobbyPlans = [SubscriptionPlan.HobbyV1, SubscriptionPlan.HobbyV2]

    // Find all workspaces with hobby plans
    const hobbyWorkspaces = await database
      .select({
        id: workspaces.id,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(inArray(subscriptions.plan, hobbyPlans))
      .then((r) => r)

    let _enqueuedJobs = 0

    // Enqueue individual grant job for each hobby workspace
    for (const workspace of hobbyWorkspaces) {
      try {
        const { maintenanceQueue } = await queues()
        await maintenanceQueue.add(
          'upgradeHobbyWorkspaceToV3Job',
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
      `Scheduled HobbyV3 upgrades for ${_enqueuedJobs} hobby workspaces`,
    )
  } catch (error) {
    console.error('Failed to schedule HobbyV3 upgrades:', error)
  }
}
