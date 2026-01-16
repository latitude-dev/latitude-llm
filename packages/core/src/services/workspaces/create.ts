import { eq } from 'drizzle-orm'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type User } from '../../schema/models/types/User'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionPlan } from '../../plans'
import { workspaces } from '../../schema/models/workspaces'
import { createSubscription } from '../subscriptions/create'
import { issueSubscriptionGrants } from '../subscriptions/grants'

export async function createWorkspace(
  {
    name,
    user,
    createdAt,
    source = 'default',
    subscriptionPlan,
    isBigAccount = false,
  }: {
    name: string
    user: User
    source?: string
    createdAt?: Date
    subscriptionPlan?: SubscriptionPlan
    isBigAccount?: boolean
  },
  transaction = new Transaction(),
) {
  return transaction.call<WorkspaceDto>(
    async (tx) => {
      const insertedWorkspaces = await tx
        .insert(workspaces)
        .values({
          name,
          creatorId: user.id,
          createdAt,
          isBigAccount,
        })
        .returning()
      let workspace = insertedWorkspaces[0]!

      const subscription = await createSubscription(
        {
          workspace,
          plan: subscriptionPlan ?? SubscriptionPlan.HobbyV3,
          createdAt,
        },
        transaction,
      ).then((r) => r.unwrap())

      const updated = await tx
        .update(workspaces)
        .set({ currentSubscriptionId: subscription.id })
        .where(eq(workspaces.id, workspace.id))
        .returning()
      workspace = updated[0]!

      await issueSubscriptionGrants(
        { subscription, workspace },
        transaction,
      ).then((r) => r.unwrap())

      return Result.ok({ ...workspace, currentSubscription: subscription })
    },
    (w) =>
      publisher.publishLater({
        type: 'workspaceCreated',
        data: {
          workspace: w,
          user,
          source,
          workspaceId: w.id,
          userEmail: user.email,
        },
      }),
  )
}
