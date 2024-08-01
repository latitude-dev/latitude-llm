import { relations } from 'drizzle-orm'
import { text, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '..'
import { timestamps } from '../schemaHelpers'
import { users } from './users'

export const sessions = latitudeSchema.table('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  ...timestamps(),
})

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))
