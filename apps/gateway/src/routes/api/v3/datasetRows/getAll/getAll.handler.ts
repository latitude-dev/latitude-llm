import { Context } from 'hono'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'

// @ts-expect-error: broken types
export const getAllDatasetRowsHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const datasetId = c.req.query('datasetId')
  const page = c.req.query('page') || '1'
  const pageSize = c.req.query('pageSize') || String(DEFAULT_PAGINATION_SIZE)

  try {
    if (!datasetId) {
      return c.json({ error: 'datasetId query parameter is required' }, 400)
    }

    const datasetsRepository = new DatasetsRepository(workspace.id)
    const datasetResult = await datasetsRepository.find(Number(datasetId))

    if (datasetResult.error) {
      return c.json({ error: 'Dataset not found' }, 404)
    }

    const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
    const rows = await datasetRowsRepository.findByDatasetPaginated({
      datasetId: datasetResult.value.id,
      page,
      pageSize,
    })

    return c.json(rows, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
