import { InferSelectModel } from 'drizzle-orm'
import { text, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const users = latitudeSchema.table('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  encryptedPassword: text('encrypted_password').notNull(),
  ...timestamps(),
})

export type User = InferSelectModel<typeof users>
