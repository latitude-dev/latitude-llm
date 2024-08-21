import { bigint, bigserial, index, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { workspaces } from '../models/workspaces'
import { timestamps } from '../schemaHelpers'

export const projects = latitudeSchema.table(
  'projects',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => ({
    projectWorkspaceIdx: index('workspace_idx').on(table.workspaceId),
  }),
)
