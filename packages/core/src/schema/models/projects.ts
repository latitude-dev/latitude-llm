import {
  bigint,
  bigserial,
  index,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { sql } from 'drizzle-orm'
import { latitudeSchema } from '../db-schema'
import { workspaces } from '../models/workspaces'
import { timestamps } from '../schemaHelpers'

export const projects = latitudeSchema.table(
  'projects',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    deletedAt: timestamp('deleted_at'),
    lastEditedAt: timestamp('last_edited_at')
      .notNull()
      .default(sql`now()`),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => ({
    projectWorkspaceIdx: index('workspace_idx').on(table.workspaceId),
    deletedAt: index('projects_deleted_at_idx').on(table.deletedAt),
  }),
)
