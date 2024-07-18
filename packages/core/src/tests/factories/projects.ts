import { faker } from '@faker-js/faker'
import { database as db } from '$core/client'
import { getUser } from '$core/data-access'
import { Result, Transaction } from '$core/lib'
import { Project, projects, Workspace, type SafeUser } from '$core/schema'

import { createWorkspace, type ICreateWorkspace } from './workspaces'

// TODO: Replace with actual service
const createProjectFn = ({
  name,
  workspaceId,
}: {
  name: string
  workspaceId: number
}) => {
  return Transaction.call<Project>(async (tx) => {
    const insertedProjects = await tx
      .insert(projects)
      .values({ name, workspaceId })
      .returning()

    const newProject = insertedProjects[0]!

    return Result.ok(newProject)
  }, db)
}

export type ICreateProject = {
  name?: string
  workspace?: Workspace | ICreateWorkspace
}
export async function createProject(projectData: Partial<ICreateProject> = {}) {
  let workspaceData = projectData.workspace ?? {}
  let user: SafeUser
  let workspace: Workspace

  if ('id' in workspaceData) {
    user = (await getUser(workspaceData.creatorId!)) as SafeUser
    workspace = workspaceData as Workspace
  } else {
    const newWorkspace = await createWorkspace(workspaceData)
    workspace = newWorkspace.workspace
    user = newWorkspace.userData
  }

  const randomName = faker.commerce.department()
  const { name } = projectData

  const result = await createProjectFn({
    name: name ?? randomName,
    workspaceId: workspace.id,
  })
  const project = result.unwrap()

  return { project, user, workspace }
}
