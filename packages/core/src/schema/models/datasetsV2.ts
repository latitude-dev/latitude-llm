import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  uniqueIndex,
  varchar,
  boolean,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'
import { workspaces } from './workspaces'
import { type DatasetColumnRole } from '../../constants'

export type Column = {
  identifier: string
  name: string
  role: DatasetColumnRole
}

// NOTE: Temporary table name to avoid conflicts with existing datasets table
// in the future old datasets will be migrated to this table and then this table
// will be renamed to datasets
export const datasetsV2 = latitudeSchema.table(
  'datasets_v2',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    authorId: text('author_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    isGolden: boolean('is_golden').notNull().default(false),
    columns: jsonb('columns').$type<Column[]>().notNull(),
    ...timestamps(),
  },
  (table) => ({
    datasetWorkspaceIdx: index('datasets_table_workspace_idx').on(
      table.workspaceId,
    ),
    authorIdx: index('datasets_table_author_idx').on(table.authorId),
    uniqueDatasetNameInWorkspace: uniqueIndex().on(
      table.workspaceId,
      table.name,
    ),
  }),
)
