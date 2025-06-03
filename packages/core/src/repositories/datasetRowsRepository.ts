import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
} from 'drizzle-orm'

import { DatasetRow, Dataset, DEFAULT_PAGINATION_SIZE } from '../browser'
import { calculateOffset } from '../lib/pagination/calculateOffset'
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

  findManyByDataset({
    dataset,
    rowIds,
  }: {
    dataset: Dataset
    rowIds: number[]
  }) {
    return this.db
      .select(tt)
      .from(datasetRows)
      .where(
        and(
          this.scopeFilter,
          inArray(datasetRows.id, rowIds),
          eq(datasetRows.datasetId, dataset.id),
        ),
      )
      .orderBy(desc(datasetRows.createdAt), desc(datasetRows.id))
  }

  findByDatasetPaginated({
    datasetId,
    page,
    pageSize,
  }: {
    page: number
    pageSize: number
    datasetId: number
  }) {
    const offset = calculateOffset(page, pageSize)
    const limit = pageSize
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
    const query = this.db
      .select(tt)
      .from(datasetRows)
      .where(and(this.scopeFilter, eq(datasetRows.datasetId, datasetId)))
      .limit(limit)
      .orderBy(desc(datasetRows.createdAt), desc(datasetRows.id))
      .offset(offset)

    return query
  }

  async fetchDatasetRowWithPosition({
    datasetId,
    datasetRowId,
    pageSize,
  }: {
    datasetId: number
    datasetRowId: number
    pageSize?: number
  }) {
    const rowResult = await this.find(datasetRowId)

    if (rowResult.error) {
      return { position: 0, page: 1 }
    }

    const row = rowResult.value
    const countResult = await this.db
      .select({
        count: sql`count(*)`.mapWith(Number).as('total_count'),
      })
      .from(datasetRows)
      .where(
        and(
          this.scopeFilter,
          eq(datasetRows.datasetId, datasetId),
          sql`(${datasetRows.id}) >= (${row.id})`,
        ),
      )

    const position = Number(countResult[0]?.count ?? 0)
    const page = Math.ceil(position / (pageSize ?? DEFAULT_PAGINATION_SIZE))

    return { position, page }
  }

  getCountByDataset(datasetId: number) {
    return this.db
      .select({
        count: count(datasetRows.id),
      })
      .from(datasetRows)
      .where(and(this.scopeFilter, eq(datasetRows.datasetId, datasetId)))
  }
}
