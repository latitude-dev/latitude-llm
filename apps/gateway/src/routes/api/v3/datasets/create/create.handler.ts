import { Context } from 'hono'
import { z } from '@hono/zod-openapi'
import { createDataset } from '@latitude-data/core/services/datasets/create'
import { findFirstUserInWorkspace } from '@latitude-data/core/data-access/users'
import { DATASET_COLUMN_ROLES } from '@latitude-data/core/constants'
import { Column } from '@latitude-data/core/schema/models/datasets'

const createDatasetSchema = z.object({
  name: z.string().min(1, 'Dataset name is required'),
  columns: z.array(
    z.object({
      identifier: z.string(),
      name: z.string(),
      role: z.enum([
        DATASET_COLUMN_ROLES.parameter,
        DATASET_COLUMN_ROLES.label,
        DATASET_COLUMN_ROLES.metadata,
      ]),
    }),
  ),
})

export const createDatasetHandler = async (c: Context) => {
  const workspace = c.get('workspace')

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

    const user = await findFirstUserInWorkspace(workspace)
    if (!user) {
      return c.json({ error: 'No users found in workspace' }, 400)
    }

    try {
      const result = await createDataset({
        author: user,
        workspace,
        data: {
          name,
          columns: columns as Column[],
        },
      })

      if (result.error) {
        return c.json({ error: result.error.message }, 400)
      }

      return c.json(result.value, 201)
    } catch (serviceError) {
      const errorMessage =
        serviceError instanceof Error
          ? serviceError.message
          : String(serviceError || 'Unknown error')
      return c.json({ error: errorMessage }, 400)
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error || 'Unknown error')
    console.error('Unexpected error:', error)
    return c.json({ error: errorMessage }, 500)
  }
}
