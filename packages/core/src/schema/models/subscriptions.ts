import { bigint, bigserial, index, timestamp } from 'drizzle-orm/pg-core'

import { SubscriptionPlan } from '../../plans'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const plansEnum = latitudeSchema.enum('subscription_plans', [
  SubscriptionPlan.HobbyV1,
  SubscriptionPlan.HobbyV2,
  SubscriptionPlan.TeamV1,
  SubscriptionPlan.EnterpriseV1,
  SubscriptionPlan.ProV2,
  SubscriptionPlan.TeamV2,
  SubscriptionPlan.TeamV3,
  SubscriptionPlan.HobbyV3,
  SubscriptionPlan.TeamV4,
  SubscriptionPlan.ScaleV1,
])

export const subscriptions = latitudeSchema.table(
  'subscriptions',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' }).notNull(),
    plan: plansEnum('plan').notNull(),
    trialEndsAt: timestamp('trial_ends_at'),
    cancelledAt: timestamp('cancelled_at'),
    ...timestamps(),
  },
  (table) => {
    return {
      workspaceIdIndex: index().on(table.workspaceId),
      planIndex: index().on(table.plan),
      cancelledAtIndex: index().on(table.cancelledAt),
    }
  },
)
