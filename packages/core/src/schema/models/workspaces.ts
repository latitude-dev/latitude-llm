import { InferSelectModel, relations } from 'drizzle-orm'
import { bigserial, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema, memberships, users } from '..'
import { timestamps } from '../schemaHelpers'

export const workspaces = latitudeSchema.table('workspaces', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  creatorId: text('creator_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  ...timestamps(),
})

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  memberships: many(memberships),
}))

export type Workspace = InferSelectModel<typeof workspaces>
