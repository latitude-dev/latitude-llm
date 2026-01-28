import { Context } from 'hono'
import { DatasetsRepository } from '@latitude-data/core/repositories'

export const getDatasetHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { datasetId } = c.req.param()

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const datasetResult = await datasetsRepository.find(Number(datasetId))
  const dataset = datasetResult.unwrap()

  return c.json(dataset, 200)
}
