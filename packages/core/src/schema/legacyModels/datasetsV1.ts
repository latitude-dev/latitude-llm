import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { type FileSnapshot } from 'flydrive/types'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from '../models/users'
import { workspaces } from '../models/workspaces'

type FileMetadata = FileSnapshot & { headers: string[]; rowCount: number }

// NOTE: Deprecated but do not delete
export const datasetsV1 = latitudeSchema.table(
  'datasets',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    csvDelimiter: varchar('csv_delimiter', { length: 256 }).notNull(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    authorId: text('author_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    fileKey: varchar('file_key', { length: 256 }).notNull(),
    fileMetadata: jsonb('file_metadata').$type<FileMetadata>().notNull(),
    ...timestamps(),
  },
  (table) => ({
    datasetWorkspaceIdx: index('datasets_workspace_idx').on(table.workspaceId),
    authorIdx: index('datasets_author_idx').on(table.authorId),
    uniqueDatasetNameInWorkspace: uniqueIndex().on(
      table.workspaceId,
      table.name,
    ),
  }),
)
