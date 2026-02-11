import { Context } from 'hono'
import { findAllActiveProjects } from '@latitude-data/core/queries/projects/findAllActive'

export const getAllHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const result = await findAllActiveProjects({ workspaceId: workspace.id })

  return c.json(result.unwrap(), 200)
}
