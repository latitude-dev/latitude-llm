import { Context } from 'hono'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { updateDataset } from '@latitude-data/core/services/datasets/update'

export const updateDatasetHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { datasetId } = c.req.param()
  const body = await c.req.json()

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const datasetResult = await datasetsRepository.find(Number(datasetId))
  const dataset = datasetResult.unwrap()

  const result = await updateDataset({
    dataset,
    data: {
      columns: body.columns,
    },
  })

  const updatedDataset = result.unwrap()
  return c.json(updatedDataset, 200)
}
