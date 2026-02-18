import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { updateDatasetRow } from '@latitude-data/core/services/datasetRows/update'
import { type DatasetRowData } from '@latitude-data/core/schema/models/datasetRows'
import { AppRouteHandler } from '$/openApi/types'
import { updateDatasetRowRouteConfig } from './update.route'

export const updateDatasetRowHandler: AppRouteHandler<
  typeof updateDatasetRowRouteConfig
> = async (c) => {
  const workspace = c.get('workspace')

  const { rowId } = c.req.valid('param')
  const { datasetId, rowData } = c.req.valid('json') as {
    datasetId: number
    rowData: DatasetRowData
  }

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const dataset = await datasetsRepository
    .find(Number(datasetId))
    .then((result) => result.unwrap())

  const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
  await datasetRowsRepository
    .find(Number(rowId))
    .then((result) => result.unwrap())

  const updatedRows = await updateDatasetRow({
    dataset,
    data: {
      rows: [
        {
          rowId: Number(rowId),
          rowData,
        },
      ],
    },
  }).then((result) => result.unwrap())

  return c.json(updatedRows[0], 200)
}
