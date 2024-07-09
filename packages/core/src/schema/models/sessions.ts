import { InferSelectModel } from 'drizzle-orm'
import { text, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'

export const sessions = latitudeSchema.table('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
  ...timestamps(),
})

export type Session = InferSelectModel<typeof sessions>
