import { boolean, text, timestamp, varchar, index } from 'drizzle-orm/pg-core'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { UserRole } from '@latitude-data/constants/users'

export const users = latitudeSchema.table(
  'users',
  {
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
    role: varchar('role', { length: 128 }).$type<UserRole>(), // can be null as signup with google bypasses the role selection
    ...timestamps(),
  },
  (table) => [index('users_role_idx').on(table.role)],
)
