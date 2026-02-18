import { DatasetsRepository } from '@latitude-data/core/repositories'
import { destroyDataset } from '@latitude-data/core/services/datasets/destroy'
import { AppRouteHandler } from '$/openApi/types'
import { destroyDatasetRouteConfig } from './destroy.route'

export const destroyDatasetHandler: AppRouteHandler<
  typeof destroyDatasetRouteConfig
> = async (c) => {
  const workspace = c.get('workspace')
  const { datasetId } = c.req.valid('param')

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const dataset = await datasetsRepository
    .find(Number(datasetId))
    .then((r) => r.unwrap())

  const deletedDataset = await destroyDataset({ dataset }).then((r) =>
    r.unwrap(),
  )

  return c.json(deletedDataset, 200)
}
