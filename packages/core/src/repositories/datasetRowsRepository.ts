import { eq, and, getTableColumns, count, desc } from 'drizzle-orm'

import { DatasetRow, DEFAULT_PAGINATION_SIZE } from '../browser'
import { datasetRows } from '../schema'
import Repository from './repositoryV2'
import { calculateOffset } from '../lib/pagination/calculateOffset'

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

  findByDatasetPaginated({
    datasetId,
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
  }: {
    page?: string
    pageSize?: string
    datasetId: number
  }) {
    const offset = calculateOffset(page, pageSize)
    const limit = parseInt(pageSize)
    return this.findByDatasetWithOffsetAndLimit({ datasetId, offset, limit })
  }

  findByDatasetWithOffsetAndLimit({
    datasetId,
    offset,
    limit,
  }: {
    datasetId: number
    offset: number
    limit: number
  }) {
    return this.db
      .select(tt)
      .from(datasetRows)
      .where(and(this.scopeFilter, eq(datasetRows.datasetId, datasetId)))
      .limit(limit)
      .orderBy(desc(datasetRows.createdAt))
      .offset(offset)
  }

  async getCountByDataset(datasetId: number) {
    const result = await this.db
      .select({
        count: count(datasetRows.id),
      })
      .from(datasetRows)
      .where(and(this.scopeFilter, eq(datasetRows.datasetId, datasetId)))

    if (!result[0]) return 0

    return result[0].count
  }
}
