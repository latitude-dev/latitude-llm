import { Context } from 'hono'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { destroyDataset } from '@latitude-data/core/services/datasets/destroy'

export const destroyDatasetHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { datasetId } = c.req.param()

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const datasetResult = await datasetsRepository.find(Number(datasetId))
  const dataset = datasetResult.unwrap()

  const result = await destroyDataset({ dataset })
  const deletedDataset = result.unwrap()

  return c.json(deletedDataset, 200)
}
