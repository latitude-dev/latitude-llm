import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { Job } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { SubscriptionPlan } from '../../../plans'
import { database } from '../../../client'
import { queues } from '../../queues'

export type GrantAdditionalSeatToHobbyUsersJobData = Record<string, never>

/**
 * Job that runs daily at 9am CEST to schedule individual jobs for granting
 * additional seats to all users with HobbyV1 or HobbyV2 subscriptions.
 *
 * This job:
 * 1. Finds all workspaces with HobbyV1 or HobbyV2 plans
 * 2. Enqueues individual grant jobs for each workspace
 * 3. Each individual job will grant 1 additional seat to that workspace
 */
export const grantAdditionalSeatToHobbyUsersJob = async (
  _: Job<GrantAdditionalSeatToHobbyUsersJobData>,
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
          'grantAdditionalSeatToWorkspaceJob',
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
      `Scheduled additional seat grants for ${_enqueuedJobs} hobby workspaces`,
    )
  } catch (error) {
    console.error('Failed to schedule additional seat grants:', error)
  }
}
