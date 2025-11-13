import { eq } from 'drizzle-orm'

import type { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type Workspace } from '../../schema/models/types/Workspace'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionPlan } from '../../plans'
import { workspaces } from '../../schema/models/workspaces'
import { createSubscription } from '../subscriptions/create'
import { issueSubscriptionGrants } from '../subscriptions/grants'

/**
 * Change the subscription plan for a workspace.
 * Creates a new subscription with the new plan and updates the workspace's current subscription.
 */
export async function changeWorkspacePlan(
  workspace: Workspace | WorkspaceDto,
  plan: SubscriptionPlan,
  transaction = new Transaction(),
) {
  return transaction.call<WorkspaceDto>(async (tx) => {
    // Create a new subscription with the new plan
    const subscription = await createSubscription(
      {
        workspace,
        plan,
      },
      transaction,
    ).then((r) => r.unwrap())

    // Update the workspace to point to the new subscription
    await tx
      .update(workspaces)
      .set({ currentSubscriptionId: subscription.id })
      .where(eq(workspaces.id, workspace.id))

    // Issue grants for the new subscription
    const updatedWorkspace = await unsafelyFindWorkspace(workspace.id, tx)
    if (!updatedWorkspace) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    await issueSubscriptionGrants(
      { subscription, workspace: updatedWorkspace },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok(updatedWorkspace)
  })
}
