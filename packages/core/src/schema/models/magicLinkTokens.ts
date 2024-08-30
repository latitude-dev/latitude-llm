import { sql } from 'drizzle-orm'
import { bigserial, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'

export const magicLinkTokens = latitudeSchema.table('magic_link_tokens', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  token: uuid('token')
    .notNull()
    .unique()
    .default(sql`gen_random_uuid()`),
  expiredAt: timestamp('expired_at'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ...timestamps(),
})
