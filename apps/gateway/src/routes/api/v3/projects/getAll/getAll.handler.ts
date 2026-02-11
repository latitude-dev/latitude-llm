import { Context } from 'hono'
import { projectsScope } from '@latitude-data/core/queries/projects/scope'
import { findAllActiveProjects } from '@latitude-data/core/queries/projects/findAllActive'

export const getAllHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const projects = projectsScope(workspace.id)
  const result = await findAllActiveProjects(projects)

  return c.json(result.unwrap(), 200)
}
