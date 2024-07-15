import { InferSelectModel, relations } from 'drizzle-orm'
import { bigint, primaryKey, text } from 'drizzle-orm/pg-core'

import { latitudeSchema, users, workspaces } from '..'
import { timestamps } from '../schemaHelpers'

export const memberships = latitudeSchema.table(
  'memberships',
  {
    workspaceId: bigint('workspace_id', { mode: 'bigint' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (membership) => ({
    compoundKey: primaryKey({
      columns: [membership.workspaceId, membership.userId],
    }),
  }),
)

export type Membership = InferSelectModel<typeof memberships>

export const membershipRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [memberships.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
}))
