import { bigint, bigserial, index, jsonb } from 'drizzle-orm/pg-core'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { datasets } from './datasets'
import { workspaces } from './workspaces'

export type DatasetRowDataContent = string | number | boolean | object | null | undefined
export type DatasetRowData = {
  [key: string]: DatasetRowDataContent
}

export const datasetRows = latitudeSchema.table(
  'dataset_rows',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    datasetId: bigserial('dataset_id', { mode: 'number' })
      .references(() => datasets.id, { onDelete: 'cascade' })
      .notNull(),
    rowData: jsonb('row_data').$type<DatasetRowData>().notNull(),
    ...timestamps(),
  },
  (table) => ({
    datasetWorkspaceIdx: index('dataset_row_workspace_idx').on(table.workspaceId),
  }),
)
