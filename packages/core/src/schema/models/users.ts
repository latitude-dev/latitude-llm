import { InferSelectModel } from 'drizzle-orm'
import { text, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '..'
import { timestamps } from '../schemaHelpers'

export const users = latitudeSchema.table('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  ...timestamps(),
})

export type User = InferSelectModel<typeof users>
