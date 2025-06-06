import { Result } from '../../../../../lib/Result'
import { ProjectsRepository } from '../../../../../repositories'
import { LatteToolFn } from '../types'

const listProjects: LatteToolFn = async ({ workspace }) => {
  const projectsScope = new ProjectsRepository(workspace.id)
  const projectsResult = await projectsScope.findAll()
  if (!projectsResult.ok) return projectsResult

  const projects = projectsResult.unwrap()
  return Result.ok(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      href: `/projects/${project.id}`,
    })),
  )
}

export default listProjects
