// A simple utility type to make all properties of T optional for creation
export type Create<T> = { [P in keyof T]?: T[P] }

import { database } from '../../client'
import { subscriptions } from '../../schema/models/subscriptions'
import { SubscriptionPlan } from '../../plans'
import { Subscription, Workspace } from '../../browser'

export type CreateSubscriptionProps = Create<Subscription> & {
  workspaceId: Workspace['id']
  plan?: SubscriptionPlan
}

export async function createSubscription(
  props: CreateSubscriptionProps,
): Promise<Subscription> {
  const { workspaceId, plan, ...rest } = props

  const [newSubscription] = await database
    .insert(subscriptions)
    .values({
      workspaceId,
      plan: plan ?? SubscriptionPlan.HobbyV1, // Default to HobbyV1 if not provided
      createdAt: new Date(), // Ensure timestamps are set
      updatedAt: new Date(), // Ensure timestamps are set
      ...rest,
    })
    .returning()

  if (!newSubscription) {
    throw new Error('Failed to create subscription in factory')
  }
  // Cast to Subscription as Drizzle might return a more generic type
  return newSubscription as unknown as Subscription
}
