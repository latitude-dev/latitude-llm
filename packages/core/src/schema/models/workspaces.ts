import { InferSelectModel, relations } from 'drizzle-orm'
import { bigserial, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users, type User } from './users'

export const workspaces = latitudeSchema.table('workspaces', {
  id: bigserial('id', { mode: 'bigint' }).notNull().primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  creatorId: text('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  ...timestamps(),
})

export const members = relations(workspaces, ({ many }) => ({
  members: many(users, { relationName: 'members' }),
}))

export type Workspace = InferSelectModel<typeof workspaces> & {
  members: User[]
}
