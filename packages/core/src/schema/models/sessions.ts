import { bigint, text, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { users } from '../models/users'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'

export const sessions = latitudeSchema.table('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentWorkspaceId: bigint('current_workspace_id', {
    mode: 'number',
  }).references(() => workspaces.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  ...timestamps(),
})
