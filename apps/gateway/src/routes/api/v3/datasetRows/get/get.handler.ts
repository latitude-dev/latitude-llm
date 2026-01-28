import { Context } from 'hono'
import { DatasetRowsRepository } from '@latitude-data/core/repositories'

export const getDatasetRowHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { rowId } = c.req.param()

  const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
  const rowResult = await datasetRowsRepository.find(Number(rowId))
  const row = rowResult.unwrap()

  return c.json(row, 200)
}
