import { InferSelectModel } from 'drizzle-orm'
import { text, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '..'
import { timestamps } from '../schemaHelpers'
import { users } from './users'

export const sessions = latitudeSchema.table('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
  ...timestamps(),
})

export type Session = InferSelectModel<typeof sessions>
