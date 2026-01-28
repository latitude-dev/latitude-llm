import { Context } from 'hono'
import { DatasetRowsRepository } from '@latitude-data/core/repositories'

// @ts-expect-error: broken types
export const getDatasetRowHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { rowId } = c.req.param()

  try {
    const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
    const rowResult = await datasetRowsRepository.find(Number(rowId))

    if (rowResult.error) {
      return c.json({ error: 'Dataset row not found' }, 404)
    }

    return c.json(rowResult.value, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
