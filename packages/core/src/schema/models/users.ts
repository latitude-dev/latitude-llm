import { relations } from 'drizzle-orm'
import { text } from 'drizzle-orm/pg-core'

import { latitudeSchema, memberships, sessions } from '../index'
import { timestamps } from '../schemaHelpers'

export const users = latitudeSchema.table('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  encryptedPassword: text('encrypted_password').notNull(),
  ...timestamps(),
})

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(memberships),
}))
