import { Context } from 'hono'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { deleteManyRows } from '@latitude-data/core/services/datasetRows/deleteManyRows'

export const destroyDatasetRowHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { rowId } = c.req.param()

  const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
  const rowResult = await datasetRowsRepository.find(Number(rowId))
  const row = rowResult.unwrap()

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const datasetResult = await datasetsRepository.find(row.datasetId)
  const dataset = datasetResult.unwrap()

  const result = await deleteManyRows({
    dataset,
    rows: [row],
  })

  const deletedRows = result.unwrap()
  return c.json(deletedRows[0], 200)
}
