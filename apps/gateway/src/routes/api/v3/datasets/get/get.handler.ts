import { DatasetsRepository } from '@latitude-data/core/repositories'
import { AppRouteHandler } from '$/openApi/types'
import { getDatasetRoute } from './get.route'

export const getDatasetHandler: AppRouteHandler<
  typeof getDatasetRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { datasetId } = c.req.valid('param')

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const dataset = await datasetsRepository
    .find(Number(datasetId))
    .then((r) => r.unwrap())

  return c.json(dataset, 200)
}
