import { bigserial, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { users } from '../models/users'
import { timestamps } from '../schemaHelpers'

export const workspaces = latitudeSchema.table('workspaces', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  creatorId: text('creator_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  ...timestamps(),
})
