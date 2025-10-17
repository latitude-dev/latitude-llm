import { type Project } from '../../../schema/models/types/Project'
import { type User } from '../../../schema/models/types/User'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { ProjectsRepository } from '../../../repositories'
import { createProject } from '../../projects'

function forkProjectName({
  title,
  prefix,
  projects,
}: {
  title: string
  prefix: string
  projects: Project[]
}) {
  const baseName = `${prefix} ${title}`
  let name = baseName
  let attempts = 0

  while (true) {
    const existingProject = projects.find((p) => p.name === name)
    if (!existingProject) return name

    attempts++
    name = `${baseName} (${attempts})`
  }
}

export async function createForkProject({
  title,
  prefix,
  workspace,
  user,
}: {
  title: string
  prefix: string
  workspace: Workspace
  user: User
}) {
  const repo = new ProjectsRepository(workspace.id)
  const projectsResult = await repo.findAll()
  const projects = projectsResult.unwrap()

  const name = forkProjectName({ title, prefix, projects })
  return createProject({ name, workspace, user })
}
