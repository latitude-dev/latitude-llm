import { Result } from '../../../../../lib/Result'
import { findAllProjects } from '../../../../../queries/projects/findAll'
import { defineLatteTool } from '../types'

const listProjects = defineLatteTool(async (_args, { workspace }) => {
  const projectsResult = await findAllProjects({ workspaceId: workspace.id })
  if (!projectsResult.ok) return projectsResult

  const projects = projectsResult.unwrap()
  return Result.ok(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      href: `/projects/${project.id}`,
    })),
  )
})

export default listProjects
