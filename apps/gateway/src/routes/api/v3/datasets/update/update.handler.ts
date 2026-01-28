import { Context } from 'hono'
import { z } from '@hono/zod-openapi'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { updateDataset } from '@latitude-data/core/services/datasets/update'

const updateDatasetSchema = z.object({
  columns: z.array(
    z.object({
      identifier: z.string(),
      name: z.string(),
      role: z.string(),
    }),
  ),
})

// @ts-expect-error: broken types
export const updateDatasetHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const { datasetId } = c.req.param()

  try {
    const body = await c.req.json()
    const validation = updateDatasetSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.format(),
        },
        400,
      )
    }

    const { columns } = validation.data

    const datasetsRepository = new DatasetsRepository(workspace.id)
    const datasetResult = await datasetsRepository.find(Number(datasetId))

    if (datasetResult.error) {
      return c.json({ error: 'Dataset not found' }, 404)
    }

    const result = await updateDataset({
      dataset: datasetResult.value,
      data: { columns },
    })

    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    return c.json(result.value, 200)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
