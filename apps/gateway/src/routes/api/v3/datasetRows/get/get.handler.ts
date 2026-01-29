import { DatasetRowsRepository } from '@latitude-data/core/repositories'
import { AppRouteHandler } from '$/openApi/types'
import { getDatasetRowRoute } from './get.route'

export const getDatasetRowHandler: AppRouteHandler<
  typeof getDatasetRowRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { rowId } = c.req.valid('param')

  const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
  const row = await datasetRowsRepository
    .find(Number(rowId))
    .then((r) => r.unwrap())

  return c.json(row, 200)
}
