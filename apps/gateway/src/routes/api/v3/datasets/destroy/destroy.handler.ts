import { Context } from 'hono'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { destroyDataset } from '@latitude-data/core/services/datasets/destroy'

// @ts-expect-error: broken types
export const destroyDatasetHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { datasetId } = c.req.param()

  try {
    const datasetsRepository = new DatasetsRepository(workspace.id)
    const datasetResult = await datasetsRepository.find(Number(datasetId))

    if (datasetResult.error) {
      return c.json({ error: 'Dataset not found' }, 404)
    }

    const result = await destroyDataset({ dataset: datasetResult.value })

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    return c.json(result.value, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
