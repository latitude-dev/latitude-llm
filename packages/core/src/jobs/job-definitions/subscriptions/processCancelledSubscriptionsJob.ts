import { Job } from 'bullmq'
import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { BillingError } from '@latitude-data/constants/errors'
import { database } from '../../../client'
import { findFirstUserInWorkspace } from '../../../queries/users/findFirstInWorkspace'
import { publisher } from '../../../events/publisher'
import Transaction from '../../../lib/Transaction'
import { SubscriptionPlan } from '../../../plans'
import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { changeWorkspacePlan } from '../../../services/workspaces/changePlan'
import { captureException } from '../../../utils/datadogCapture'

export type ProcessCancelledSubscriptionsJobData = Record<string, never>

/**
 * Nightly job that processes cancelled subscriptions.
 *
 * Finds subscriptions where:
 * - cancelledAt is set and in the past
 * - The subscription is still the current one for its workspace
 *
 * For each such subscription downgrates the workspace to the HobbyV3 with trial expired.
 */
export async function processCancelledSubscriptionsJob(
  _: Job<ProcessCancelledSubscriptionsJobData>,
) {
  const now = new Date()

  const cancelledSubscriptions = await database
    .select({
      subscription: subscriptions,
      workspace: workspaces,
    })
    .from(subscriptions)
    .innerJoin(
      workspaces,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .where(
      and(
        isNotNull(subscriptions.cancelledAt),
        lte(subscriptions.cancelledAt, now),
      ),
    )

  for (const { subscription, workspace } of cancelledSubscriptions) {
    try {
      const transaction = new Transaction()
      await transaction.call(
        async () => {
          return await changeWorkspacePlan(
            workspace,
            SubscriptionPlan.HobbyV3,
            { createWithTrialExpired: true },
            transaction,
          )
        },
        async ({ workspace: updatedWorkspace, subscription }) => {
          const firstUser = await findFirstUserInWorkspace({
            workspaceId: updatedWorkspace.id,
          })
          publisher.publishLater({
            type: 'subscriptionUpdated',
            data: {
              workspace: updatedWorkspace,
              subscription,
              userEmail: firstUser.email,
            },
          })
        },
      )
    } catch (error) {
      const billingError = new BillingError(
        `Failed to downgrade workspace ${workspace.id} from cancelled subscription ${subscription.id} with plan ${subscription.plan} to HobbyV3`,
        {
          originalError: error as Error,
          tags: { workspaceId: workspace.id },
        },
      )
      // Allow to fail individual subscription downgrades without failing the whole job
      captureException(billingError, billingError.tags)
    }
  }
}
