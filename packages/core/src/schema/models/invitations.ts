import { text, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'
import { workspaces } from './workspaces'

export const invitations = latitudeSchema.table('invitations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  status: text('status').notNull().default('pending'), // 'pending', 'accepted', 'expired'
  invitedByUserId: text('invited_by_user_id')
    .notNull()
    .references(() => users.id),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  ...timestamps(),
})

export type Invitation = typeof invitations.$inferSelect // return type when queried
export type NewInvitation = typeof invitations.$inferInsert // insert type
