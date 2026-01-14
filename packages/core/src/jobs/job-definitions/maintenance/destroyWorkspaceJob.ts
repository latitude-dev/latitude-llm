import { Job } from 'bullmq'
import { eq } from 'drizzle-orm'

import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { apiKeys } from '../../../schema/models/apiKeys'
import { claimedRewards } from '../../../schema/models/claimedRewards'
import { integrations } from '../../../schema/models/integrations'
import { providerApiKeys } from '../../../schema/models/providerApiKeys'
import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { queues } from '../../queues'

export type DestroyWorkspaceJobData = {
  workspaceId: number
}

/**
 * Enqueues a job to permanently destroy a workspace.
 * Use this instead of calling destroyWorkspaceJob directly to ensure
 * the deletion runs in the background.
 */
export async function enqueueDestroyWorkspaceJob(workspaceId: number) {
  const { maintenanceQueue } = await queues()
  return maintenanceQueue.add(
    'destroyWorkspaceJob',
    { workspaceId },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  )
}

/**
 * Background job that permanently destroys a workspace and all associated data.
 * This is a destructive operation that cannot be undone.
 *
 * Handles cleanup of tables that don't have cascade delete:
 * - providerApiKeys
 * - apiKeys
 * - claimedRewards
 * - integrations
 * - subscriptions
 *
 * All other related tables (projects, memberships, etc.) are handled
 * by database cascade delete constraints.
 */
export const destroyWorkspaceJob = async (
  job: Job<DestroyWorkspaceJobData>,
) => {
  const { workspaceId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    return Result.nil()
  }

  return new Transaction().call(async (tx) => {
    await tx
      .delete(providerApiKeys)
      .where(eq(providerApiKeys.workspaceId, workspaceId))

    await tx.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId))

    await tx
      .delete(claimedRewards)
      .where(eq(claimedRewards.workspaceId, workspaceId))

    await tx
      .delete(integrations)
      .where(eq(integrations.workspaceId, workspaceId))

    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId))

    await tx
      .delete(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))

    return Result.ok({ workspaceId })
  })
}
