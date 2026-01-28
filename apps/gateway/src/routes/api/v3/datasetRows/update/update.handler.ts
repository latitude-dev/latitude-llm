import { Context } from 'hono'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { updateDatasetRow } from '@latitude-data/core/services/datasetRows/update'

export const updateDatasetRowHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { rowId } = c.req.param()
  const body = await c.req.json()

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const datasetResult = await datasetsRepository.find(Number(body.datasetId))
  const dataset = datasetResult.unwrap()

  const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
  const rowResult = await datasetRowsRepository.find(Number(rowId))
  rowResult.unwrap()

  const result = await updateDatasetRow({
    dataset,
    data: {
      rows: [
        {
          rowId: Number(rowId),
          rowData: body.rowData,
        },
      ],
    },
  })

  const updatedRows = result.unwrap()
  return c.json(updatedRows[0], 200)
}
