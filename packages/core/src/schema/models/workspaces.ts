import { bigint, bigserial, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { users } from '../models/users'
import { timestamps } from '../schemaHelpers'
import { subscriptions } from './subscriptions'

export const workspaces = latitudeSchema.table('workspaces', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  currentSubscriptionId: bigint('current_subscription_id', {
    mode: 'number',
  }).references(() => subscriptions.id).notNull(),
  creatorId: text('creator_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  ...timestamps(),
})
