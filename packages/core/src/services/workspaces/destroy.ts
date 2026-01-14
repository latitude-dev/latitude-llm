import { eq } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema/models/apiKeys'
import { claimedRewards } from '../../schema/models/claimedRewards'
import { integrations } from '../../schema/models/integrations'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { subscriptions } from '../../schema/models/subscriptions'
import { workspaces } from '../../schema/models/workspaces'
import type { Workspace } from '../../schema/models/types/Workspace'

/**
 * Permanently destroys a workspace and all associated data.
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
export async function destroyWorkspace(
  workspace: Workspace,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const workspaceId = workspace.id

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

    return Result.ok(workspace)
  })
}
