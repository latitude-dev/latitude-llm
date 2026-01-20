import type { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Subscription } from '../../schema/models/types/Subscription'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionPlan } from '../../plans'
import { createSubscription } from '../subscriptions/create'
import { issueSubscriptionGrants } from '../subscriptions/grants'
import { updateWorkspace } from './update'

export type ChangeWorkspacePlanResult = {
  workspace: WorkspaceDto
  subscription: Subscription
}

/**
 * Change the subscription plan for a workspace.
 * Creates a new subscription with the new plan and updates the workspace's current subscription.
 *
 * @param workspace - The workspace to change the plan for
 * @param plan - The new subscription plan
 * @param options.createWithTrialExpired - If true, creates the subscription with an already expired trial
 * @param transaction - Optional transaction to use
 */
export async function changeWorkspacePlan(
  workspace: Workspace | WorkspaceDto,
  plan: SubscriptionPlan,
  options: { createWithTrialExpired?: boolean } = {},
  transaction = new Transaction(),
) {
  const { createWithTrialExpired = false } = options

  return transaction.call<ChangeWorkspacePlanResult>(async () => {
    const subscription = await createSubscription(
      {
        workspace,
        plan,
        createWithTrialExpired,
      },
      transaction,
    ).then((r) => r.unwrap())

    const updatedWorkspace = await updateWorkspace(
      workspace,
      {
        currentSubscriptionId: subscription.id,
      },
      transaction,
    ).then((r) => r.unwrap())

    await issueSubscriptionGrants(
      { subscription, workspace: updatedWorkspace },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok({ workspace: updatedWorkspace, subscription })
  })
}
