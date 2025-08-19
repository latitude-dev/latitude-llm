import { faker } from '@faker-js/faker'

import { SubscriptionPlan, type User } from '../../browser'
import { createMembership } from '../../services/memberships/create'
import { createWorkspaceOnboarding } from '../../services/workspaceOnboarding'
import { createWorkspace as createWorkspaceFn } from '../../services/workspaces/create'
import { createUser, type ICreateUser } from './users'

export type ICreateWorkspace = {
  name?: string
  creator?: User | ICreateUser
  createdAt?: Date
  subscriptionPlan?: SubscriptionPlan
  onboarding?: boolean
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
    user: userData,
    createdAt: workspaceData.createdAt,
  })
  const workspace = result.unwrap()
  await createMembership({ workspace, user: userData }).then((r) => r.unwrap())

  if (workspaceData.onboarding) {
    await createWorkspaceOnboarding({ workspace }).then((r) => r.unwrap())
  }

  return { workspace, userData }
}

export type CreateWorkspaceResult = Awaited<ReturnType<typeof createWorkspace>>
