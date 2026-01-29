import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { deleteManyRows } from '@latitude-data/core/services/datasetRows/deleteManyRows'
import { AppRouteHandler } from '$/openApi/types'
import { destroyDatasetRowRoute } from './destroy.route'

export const destroyDatasetRowHandler: AppRouteHandler<
  typeof destroyDatasetRowRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { rowId } = c.req.valid('param')

  const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
  const row = await datasetRowsRepository
    .find(Number(rowId))
    .then((r) => r.unwrap())

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const dataset = await datasetsRepository
    .find(row.datasetId)
    .then((r) => r.unwrap())

  const deletedRows = await deleteManyRows({
    dataset,
    rows: [row],
  }).then((r) => r.unwrap())

  return c.json(deletedRows[0], 200)
}
