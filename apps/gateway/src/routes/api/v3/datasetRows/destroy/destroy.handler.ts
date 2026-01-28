import { Context } from 'hono'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { deleteManyRows } from '@latitude-data/core/services/datasetRows/deleteManyRows'

export const destroyDatasetRowHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { rowId } = c.req.param()

  try {
    const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
    const rowResult = await datasetRowsRepository.find(Number(rowId))

    if (rowResult.error) {
      return c.json({ error: 'Dataset row not found' }, 404)
    }

    const datasetsRepository = new DatasetsRepository(workspace.id)
    const datasetResult = await datasetsRepository.find(rowResult.value.datasetId)

    if (datasetResult.error) {
      return c.json({ error: 'Dataset not found' }, 404)
    }

    const result = await deleteManyRows({
      dataset: datasetResult.value,
      rows: [rowResult.value],
    })

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    return c.json(result.value[0], 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
