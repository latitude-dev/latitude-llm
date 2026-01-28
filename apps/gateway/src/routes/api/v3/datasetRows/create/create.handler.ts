import { Context } from 'hono'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { createDatasetRow } from '@latitude-data/core/services/datasetRows/create'

export const createDatasetRowHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const body = await c.req.json()

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const datasetResult = await datasetsRepository.find(Number(body.datasetId))
  const dataset = datasetResult.unwrap()

  const result = await createDatasetRow({
    workspace,
    dataset,
    data: {
      rowData: body.rowData,
    },
  })

  const row = result.unwrap()
  return c.json(row, 201)
}
