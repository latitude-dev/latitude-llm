import { Context } from 'hono'
import { ProjectsRepository } from '@latitude-data/core/repositories'

export const getAllHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const projectsRepository = new ProjectsRepository(workspace.id)
  const projectsResult = await projectsRepository.findAllActive()
  const projects = projectsResult.unwrap()

  return c.json(projects, 200)
}
