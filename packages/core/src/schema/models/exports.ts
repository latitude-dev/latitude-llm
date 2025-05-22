import { bigint, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { workspaces } from './workspaces'
import { timestamps } from '../schemaHelpers'
import { latitudeSchema } from '../db-schema'

export const latitudeExports = latitudeSchema.table('exports', {
  uuid: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: bigint('workspace_id', { mode: 'number' })
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  readyAt: timestamp('ready_at'),
  fileKey: text('file_key').notNull(),
  ...timestamps(),
})
