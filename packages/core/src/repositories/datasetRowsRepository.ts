import { eq, and, getTableColumns } from 'drizzle-orm'

import { DatasetRow } from '../browser'
import { datasetRows } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(datasetRows)

export class DatasetRowsRepository extends Repository<DatasetRow> {
  get scopeFilter() {
    return eq(datasetRows.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(datasetRows)
      .where(this.scopeFilter)
      .$dynamic()
  }

  findByDataset(datasetId: number) {
    return this.db
      .select(tt)
      .from(datasetRows)
      .where(and(this.scopeFilter, eq(datasetRows.datasetId, datasetId)))
  }
}
