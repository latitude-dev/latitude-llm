import { faker } from '@faker-js/faker'
import { type SafeUser } from '$core/schema'
import { createWorkspace as createWorkspaceFn } from '$core/services/workspaces/create'

import { createUser, type ICreateUser } from './users'

export type ICreateWorkspace = {
  name?: string
  creator?: SafeUser | ICreateUser
}
export async function createWorkspace(
  workspaceData: Partial<ICreateWorkspace> = {},
) {
  let userData = workspaceData.creator ?? {}
  if (!('id' in userData)) {
    userData = await createUser(userData)
  }

  const randomName = faker.company.name()
  const { name } = workspaceData
  const result = await createWorkspaceFn({
    name: name ?? randomName,
    creatorId: userData.id,
  })
  const workspace = result.unwrap()

  return { workspace, userData }
}
