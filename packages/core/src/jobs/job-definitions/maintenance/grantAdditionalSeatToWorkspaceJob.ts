import { Job } from 'bullmq'
import { Result } from '../../../lib/Result'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { findWorkspaceSubscription } from '../../../services/subscriptions/data-access/find'
import { SubscriptionPlan } from '../../../plans'
import { GrantSource, QuotaType } from '../../../constants'
import { issueGrant } from '../../../services/grants/issue'
import Transaction from '../../../lib/Transaction'
import { createHash } from 'crypto'

export type GrantAdditionalSeatToWorkspaceJobData = {
  workspaceId: number
}

/**
 * Job that grants an additional seat to a specific workspace with HobbyV1 or HobbyV2 subscription.
 *
 * This job:
 * 1. Finds the workspace and validates it has a hobby plan
 * 2. Issues an additional seat grant using idempotency keys
 * 3. Uses proper error handling and logging
 */
export const grantAdditionalSeatToWorkspaceJob = async (
  job: Job<GrantAdditionalSeatToWorkspaceJobData>,
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

  const hobbyPlans = [SubscriptionPlan.HobbyV1, SubscriptionPlan.HobbyV2]
  if (!hobbyPlans.includes(subscription.plan)) {
    console.log(
      `Workspace ${workspaceId} is not on a hobby plan (${subscription.plan}), skipping`,
    )
    return Result.nil()
  }

  try {
    // Create idempotency key to prevent duplicate grants
    // Generate a deterministic UUID based on workspace ID and date
    const dateStr = new Date().toISOString().split('T')[0]
    const hash = createHash('sha256')
      .update(`hobby-additional-seat-${workspaceId}-${dateStr}`)
      .digest('hex')
      .substring(0, 32)

    // Format as UUID v4
    const idempotencyKey = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16), // Version 4
      ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) +
        hash.substring(17, 20), // Variant bits
      hash.substring(20, 32),
    ].join('-')

    const transaction = new Transaction()
    const result = await transaction.call(async () => {
      return await issueGrant(
        {
          type: QuotaType.Seats,
          amount: 1,
          source: GrantSource.Subscription,
          referenceId: subscription.id.toString(),
          workspace,
          idempotencyKey,
        },
        transaction,
      )
    })

    if (result.error) {
      console.error(
        `Failed to grant additional seat to workspace ${workspaceId}:`,
        result.error,
      )
      return Result.error(result.error)
    } else {
      console.log(
        `Successfully granted additional seat to workspace ${workspaceId}`,
      )
      return Result.ok(result.value)
    }
  } catch (error) {
    console.error(`Error processing workspace ${workspaceId}:`, error)
    return Result.error(error as Error)
  }
}
