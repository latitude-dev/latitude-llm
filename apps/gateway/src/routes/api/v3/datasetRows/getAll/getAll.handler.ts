import { Context } from 'hono'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'

export const getAllDatasetRowsHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const datasetId = c.req.query('datasetId')
  const page = c.req.query('page') || '1'
  const pageSize = c.req.query('pageSize') || String(DEFAULT_PAGINATION_SIZE)

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const datasetResult = await datasetsRepository.find(Number(datasetId))
  const dataset = datasetResult.unwrap()

  const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
  const rows = await datasetRowsRepository.findByDatasetPaginated({
    datasetId: dataset.id,
    page,
    pageSize,
  })

  return c.json(rows, 200)
}
