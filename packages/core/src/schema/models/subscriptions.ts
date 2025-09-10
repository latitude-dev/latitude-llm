import { bigint, bigserial, index } from 'drizzle-orm/pg-core'

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
])

export const subscriptions = latitudeSchema.table(
  'subscriptions',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' }).notNull(),
    plan: plansEnum('plan').notNull(),
    ...timestamps(),
  },
  (table) => {
    return {
      workspaceIdIndex: index().on(table.workspaceId),
      planIndex: index().on(table.plan),
    }
  },
)
