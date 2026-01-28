import { Context } from 'hono'
import { z } from '@hono/zod-openapi'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { createDatasetRow } from '@latitude-data/core/services/datasetRows/create'

const createDatasetRowSchema = z.object({
  datasetId: z.number(),
  rowData: z.record(z.string(), z.any()),
})

// @ts-expect-error: broken types
export const createDatasetRowHandler = async (c: Context) => {
  const workspace = c.get('workspace')

  try {
    const body = await c.req.json()
    const validation = createDatasetRowSchema.safeParse(body)

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

    const result = await createDatasetRow({
      workspace,
      dataset: datasetResult.value,
      data: { rowData },
    })

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    return c.json(result.value, 201)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
