import { faker } from '@faker-js/faker'
import { getUser } from '$core/data-access'
import { Workspace, type SafeUser } from '$core/schema'
import { createProject as createProjectFn } from '$core/services/projects'

import { createWorkspace, type ICreateWorkspace } from './workspaces'

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
