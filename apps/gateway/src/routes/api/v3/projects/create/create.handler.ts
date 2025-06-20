import { Context } from 'hono'
import { z } from '@hono/zod-openapi'
import { createProject } from '@latitude-data/core/services/projects/create'
import { database } from '@latitude-data/core/client'
import { findFirstUserInWorkspace } from '@latitude-data/core/data-access'
import { AppRouteHandler } from '$/openApi/types'
import { createRoute } from './create.route'

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
})

// @ts-expect-error: broken types
export const createHandler: AppRouteHandler<typeof createRoute> = async (
  c: Context,
) => {
  const workspace = c.get('workspace')

  try {
    const body = await c.req.json()

    const validation = createProjectSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.format(),
        },
        400,
      )
    }

    const { name } = validation.data

    const user = await findFirstUserInWorkspace(workspace)
    if (!user) {
      return c.json({ error: 'No users found in workspace' }, 400)
    }

    const result = await createProject(
      {
        name,
        workspace,
        user,
      },
      database,
    ).then((r) => r.unwrap())

    return c.json({ project: result.project, version: result.commit }, 201)
  } catch (error) {
    console.error('Unexpected error:', error)
    return c.json({ error: 'Unexpected error', details: String(error) }, 500)
  }
}
