import { pgTable, jsonb, bigserial, bigint, index } from 'drizzle-orm/pg-core'
import { timestamps } from '../schemaHelpers'
import { datasetsV2 } from './datasetsV2'
import { workspaces } from './workspaces'

export type DatasetRowDataContent = string | number | boolean | null | undefined
export type DatasetRowData = {
  [key: string]: DatasetRowDataContent
}

export const datasetRows = pgTable(
  'dataset_rows',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    datasetId: bigserial('dataset_id', { mode: 'number' })
      .references(() => datasetsV2.id, { onDelete: 'cascade' })
      .notNull(),
    rowData: jsonb('row_data').$type<DatasetRowData>().notNull(),
    ...timestamps(),
  },
  (table) => ({
    datasetWorkspaceIdx: index('dataset_row_workspace_idx').on(
      table.workspaceId,
    ),
  }),
)
