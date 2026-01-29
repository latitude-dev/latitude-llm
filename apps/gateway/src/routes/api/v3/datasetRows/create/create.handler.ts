import { DatasetsRepository } from '@latitude-data/core/repositories'
import { createDatasetRow } from '@latitude-data/core/services/datasetRows/create'
import { type DatasetRowData } from '@latitude-data/core/schema/models/datasetRows'
import { AppRouteHandler } from '$/openApi/types'
import { createDatasetRowRoute } from './create.route'

export const createDatasetRowHandler: AppRouteHandler<
  typeof createDatasetRowRoute
> = async (c) => {
  const workspace = c.get('workspace')

  const { datasetId, rowData } = c.req.valid('json') as {
    datasetId: number
    rowData: DatasetRowData
  }

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const dataset = await datasetsRepository
    .find(Number(datasetId))
    .then((result) => result.unwrap())

  const row = await createDatasetRow({
    workspace,
    dataset,
    data: { rowData },
  }).then((result) => result.unwrap())

  return c.json(row, 201)
}
