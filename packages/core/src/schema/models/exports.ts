import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { workspaces } from './workspaces'
import { timestamps } from '../schemaHelpers'

export const exports = pgTable('exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  readyAt: timestamp('ready_at'),
  ...timestamps(),
})

export type Export = typeof exports.$inferSelect
export type NewExport = typeof exports.$inferInsert
