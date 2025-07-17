import { eq } from 'drizzle-orm'

import { User, WorkspaceDto } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionPlan } from '../../plans'
import { workspaces } from '../../schema'
import { createSubscription } from '../subscriptions/create'

export async function createWorkspace(
  {
    name,
    user,
    createdAt,
    subscriptionPlan = SubscriptionPlan.HobbyV2,
  }: {
    name: string
    user: User
    createdAt?: Date
    subscriptionPlan?: SubscriptionPlan
  },
  db = database,
) {
  return Transaction.call<WorkspaceDto>(async (tx) => {
    const insertedWorkspaces = await tx
      .insert(workspaces)
      .values({ name, creatorId: user.id, createdAt })
      .returning()
    let workspace = insertedWorkspaces[0]!

    const subscription = await createSubscription(
      {
        workspace,
        plan: subscriptionPlan,
        createdAt,
      },
      tx,
    ).then((r) => r.unwrap())

    const updated = await tx
      .update(workspaces)
      .set({ currentSubscriptionId: subscription.id })
      .where(eq(workspaces.id, workspace.id))
      .returning()
    workspace = updated[0]!

    publisher.publishLater({
      type: 'workspaceCreated',
      data: {
        workspace,
        user,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })

    return Result.ok({ ...workspace, currentSubscription: subscription })
  }, db)
}
