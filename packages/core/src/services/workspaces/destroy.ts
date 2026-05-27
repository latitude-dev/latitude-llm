import { eq, inArray } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationResults } from '../../schema/legacyModels/evaluationResults'
import { evaluations } from '../../schema/legacyModels/evaluations'
import { providerLogs } from '../../schema/legacyModels/providerLogs'
import { apiKeys } from '../../schema/models/apiKeys'
import { claimedRewards } from '../../schema/models/claimedRewards'
import { events } from '../../schema/models/events'
import { integrations } from '../../schema/models/integrations'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { spans } from '../../schema/models/spans'
import { subscriptions } from '../../schema/models/subscriptions'
import { workspaces } from '../../schema/models/workspaces'
import type { Workspace } from '../../schema/models/types/Workspace'

/**
 * Permanently destroys a workspace and all associated data.
 * This is a destructive operation that cannot be undone.
 *
 * The deletion order is forced by the foreign key graph and must not be
 * reordered casually:
 *
 * - `spans` and `provider_logs` reference `apiKeys`/`providerApiKeys` with
 *   `onDelete: 'restrict'`, so they must be deleted before those keys.
 * - `evaluation_results` (legacy v1) references `provider_logs` without a
 *   cascade and has no `workspaceId` of its own, so it must be deleted (scoped
 *   through its `evaluations`) before the provider logs.
 * - `apiKeys`, `providerApiKeys`, `claimedRewards`, `integrations` and `events`
 *   reference `workspaces` without a cascade, so they must be deleted before
 *   the workspace row.
 * - `workspaces.currentSubscriptionId` references `subscriptions`, so the
 *   workspace must be deleted before its subscriptions.
 *
 * All other related tables (projects, memberships, document logs, evaluations,
 * etc.) are removed by database cascade delete constraints when the workspace
 * row is deleted.
 */
export async function destroyWorkspace(
  workspace: Workspace,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const workspaceId = workspace.id

    await tx.delete(evaluationResults).where(
      inArray(
        evaluationResults.evaluationId,
        tx
          .select({ id: evaluations.id })
          .from(evaluations)
          .where(eq(evaluations.workspaceId, workspaceId)),
      ),
    )

    await tx.delete(spans).where(eq(spans.workspaceId, workspaceId))

    await tx
      .delete(providerLogs)
      .where(eq(providerLogs.workspaceId, workspaceId))

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

    await tx.delete(events).where(eq(events.workspaceId, workspaceId))

    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId))

    await tx
      .delete(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))

    return Result.ok(workspace)
  })
}
