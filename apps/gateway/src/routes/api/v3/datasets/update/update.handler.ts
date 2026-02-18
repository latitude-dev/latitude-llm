import { DatasetsRepository } from '@latitude-data/core/repositories'
import { updateDataset } from '@latitude-data/core/services/datasets/update'
import { type Column } from '@latitude-data/core/schema/models/datasets'
import { AppRouteHandler } from '$/openApi/types'
import { updateDatasetRouteConfig } from './update.route'

export const updateDatasetHandler: AppRouteHandler<
  typeof updateDatasetRouteConfig
> = async (c) => {
  const workspace = c.get('workspace')

  const { datasetId } = c.req.valid('param')
  const { columns } = c.req.valid('json') as {
    columns: Column[]
  }

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const dataset = await datasetsRepository
    .find(Number(datasetId))
    .then((result) => result.unwrap())

  const updatedDataset = await updateDataset({
    dataset,
    data: { columns },
  }).then((result) => result.unwrap())

  return c.json(updatedDataset, 200)
}
