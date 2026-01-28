import { Context } from 'hono'
import { z } from '@hono/zod-openapi'
import { createDataset } from '@latitude-data/core/services/datasets/create'

const createDatasetSchema = z.object({
  name: z.string().min(1, 'Dataset name is required'),
  columns: z.array(
    z.object({
      identifier: z.string(),
      name: z.string(),
      role: z.string(),
    }),
  ),
})

// @ts-expect-error: broken types
export const createDatasetHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const user = c.get('user')

  try {
    const body = await c.req.json()
    const validation = createDatasetSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.format(),
        },
        400,
      )
    }

    const { name, columns } = validation.data

    const result = await createDataset({
      author: user,
      workspace,
      data: {
        name,
        columns,
      },
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
