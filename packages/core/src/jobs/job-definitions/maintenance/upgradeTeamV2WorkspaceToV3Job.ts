import { Job } from 'bullmq'
import { Result } from '../../../lib/Result'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { findWorkspaceSubscription } from '../../../services/subscriptions/data-access/find'
import { SubscriptionPlan } from '../../../plans'
import Transaction from '../../../lib/Transaction'
import { createSubscription } from '../../../services/subscriptions/create'
import { issueSubscriptionGrants } from '../../../services/subscriptions/grants'
import { eq } from 'drizzle-orm'
import { workspaces } from '../../../schema/models/workspaces'

export type UpgradeTeamV2WorkspaceToV3JobData = {
  workspaceId: number
}

/**
 * Job that upgrades a specific workspace with TeamV2 subscription to TeamV3.
 *
 * This job:
 * 1. Finds the workspace and validates it has a TeamV2 plan
 * 2. Creates a new TeamV3 subscription
 * 3. Assigns it as the workspace's current subscription
 * 4. Issues subscription grants for the new plan
 * 5. Uses proper error handling and logging
 */
export const upgradeTeamV2WorkspaceToV3Job = async (
  job: Job<UpgradeTeamV2WorkspaceToV3JobData>,
) => {
  const { workspaceId } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    console.error(`Workspace ${workspaceId} not found`)
    return Result.nil()
  }

  const subscription = await findWorkspaceSubscription({ workspace }).then(
    (r) => r.value,
  )
  if (!subscription) {
    console.error(`No subscription found for workspace ${workspaceId}`)
    return Result.nil()
  }

  // Only process TeamV2 workspaces
  if (subscription.plan !== SubscriptionPlan.TeamV2) {
    console.log(
      `Workspace ${workspaceId} is not on TeamV2 plan (${subscription.plan}), skipping`,
    )
    return Result.nil()
  }

  try {
    const transaction = new Transaction()
    const result = await transaction.call(async (tx) => {
      // Create new TeamV3 subscription
      const newSubscriptionResult = await createSubscription(
        {
          workspace,
          plan: SubscriptionPlan.TeamV3,
        },
        transaction,
      )

      if (newSubscriptionResult.error) {
        return Result.error(newSubscriptionResult.error)
      }

      const newSubscription = newSubscriptionResult.value

      // Update workspace to use new subscription
      const [updatedWorkspace] = await tx
        .update(workspaces)
        .set({ currentSubscriptionId: newSubscription.id })
        .where(eq(workspaces.id, workspace.id))
        .returning()

      if (!updatedWorkspace) {
        return Result.error(
          new Error('Failed to update workspace with new subscription'),
        )
      }

      // Issue subscription grants for the new plan
      const grantsResult = await issueSubscriptionGrants(
        { subscription: newSubscription, workspace },
        transaction,
      )

      if (grantsResult.error) {
        return Result.error(grantsResult.error)
      }

      return Result.ok({
        workspace: updatedWorkspace,
        subscription: newSubscription,
        grants: grantsResult.value,
      })
    })

    if (result.error) {
      console.error(
        `Failed to upgrade workspace ${workspaceId} to TeamV3:`,
        result.error,
      )
      return Result.error(result.error)
    } else {
      console.log(
        `Successfully upgraded workspace ${workspaceId} from TeamV2 to TeamV3`,
      )
      return Result.ok(result.value)
    }
  } catch (error) {
    console.error(`Error processing workspace ${workspaceId}:`, error)
    return Result.error(error as Error)
  }
}
