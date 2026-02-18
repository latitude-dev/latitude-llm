import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'
import { AppRouteHandler } from '$/openApi/types'
import { getAllDatasetRowsRouteConfig } from './getAll.route'

export const getAllDatasetRowsHandler: AppRouteHandler<
  typeof getAllDatasetRowsRouteConfig
> = async (c) => {
  const workspace = c.get('workspace')
  const { datasetId, page, pageSize } = c.req.valid('query')

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const dataset = await datasetsRepository
    .find(Number(datasetId))
    .then((r) => r.unwrap())

  const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
  const rows = await datasetRowsRepository.findByDatasetPaginated({
    datasetId: dataset.id,
    page: page || '1',
    pageSize: pageSize || String(DEFAULT_PAGINATION_SIZE),
  })

  return c.json(rows, 200)
}
