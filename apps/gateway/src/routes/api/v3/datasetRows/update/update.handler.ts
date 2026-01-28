import { Context } from 'hono'
import { z } from '@hono/zod-openapi'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { updateDatasetRow } from '@latitude-data/core/services/datasetRows/update'

const updateDatasetRowSchema = z.object({
  datasetId: z.number(),
  rowData: z.record(z.string(), z.any()),
})

// @ts-expect-error: broken types
export const updateDatasetRowHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { rowId } = c.req.param()

  try {
    const body = await c.req.json()
    const validation = updateDatasetRowSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.format(),
        },
        400,
      )
    }

    const { datasetId, rowData } = validation.data

    const datasetsRepository = new DatasetsRepository(workspace.id)
    const datasetResult = await datasetsRepository.find(Number(datasetId))

    if (datasetResult.error) {
      return c.json({ error: 'Dataset not found' }, 404)
    }

    const datasetRowsRepository = new DatasetRowsRepository(workspace.id)
    const rowResult = await datasetRowsRepository.find(Number(rowId))

    if (rowResult.error) {
      return c.json({ error: 'Dataset row not found' }, 404)
    }

    const result = await updateDatasetRow({
      dataset: datasetResult.value,
      data: {
        rows: [
          {
            rowId: Number(rowId),
            rowData,
          },
        ],
      },
    })

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    return c.json(result.value[0], 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
