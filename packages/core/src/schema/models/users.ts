import { boolean, text, timestamp } from 'drizzle-orm/pg-core'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const users = latitudeSchema.table('users', {
  // FIXME: why is this a text column and not a uuid or at least a varchar???
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  confirmedAt: timestamp('confirmed_at'),
  admin: boolean('admin').notNull().default(false),
  lastSuggestionNotifiedAt: timestamp('last_suggestion_notified_at'),
  devMode: boolean('dev_mode'),
  ...timestamps(),
})
