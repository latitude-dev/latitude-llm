import {
  AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { users } from '../models/users'
import { timestamps } from '../schemaHelpers'
import { providerApiKeys } from './providerApiKeys'
import { subscriptions } from './subscriptions'

export const workspaces = latitudeSchema.table('workspaces', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  uuid: uuid('uuid').notNull().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  currentSubscriptionId: bigint('current_subscription_id', {
    mode: 'number',
  }).references(() => subscriptions.id),
  creatorId: text('creator_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  defaultProviderId: bigint('default_provider_id', {
    mode: 'number',
  }).references((): AnyPgColumn => providerApiKeys.id, {
    onDelete: 'set null',
  }),
  issuesUnlocked: boolean('issues_unlocked').notNull().default(false),
  isBigAccount: boolean('is_big_account').notNull().default(false),
  ...timestamps(),
})
