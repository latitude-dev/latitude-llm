import { faker } from '@faker-js/faker'

import { SubscriptionPlan } from '../../plans'
import { type User } from '../../schema/models/types/User'
import { createFeature } from '../../services/features/create'
import { createMembership } from '../../services/memberships/create'
import { toggleWorkspaceFeature } from '../../services/workspaceFeatures/toggle'
import { createWorkspaceOnboarding } from '../../services/workspaceOnboarding'
import { createWorkspace as createWorkspaceFn } from '../../services/workspaces/create'
import { createUser, type ICreateUser } from './users'

export type ICreateWorkspace = {
  name?: string
  creator?: User | ICreateUser
  createdAt?: Date
  subscriptionPlan?: SubscriptionPlan
  source?: string
  onboarding?: boolean
  features?: string[]
  isBigAccount?: boolean
  stripeCustomerId?: string
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
    subscriptionPlan: workspaceData.subscriptionPlan,
    createdAt: workspaceData.createdAt,
    isBigAccount: workspaceData.isBigAccount,
    stripeCustomerId: workspaceData.stripeCustomerId,
  })
  const workspace = result.unwrap()
  await createMembership({ workspace, user: userData }).then((r) => r.unwrap())

  if (workspaceData.onboarding) {
    await createWorkspaceOnboarding({ workspace }).then((r) => r.unwrap())
  }

  if (workspaceData.features) {
    for (const name of workspaceData.features) {
      const feature = await createFeature({ name }).then((r) => r.unwrap())
      await toggleWorkspaceFeature(workspace.id, feature.id, true).then((r) =>
        r.unwrap(),
      )
    }
  }

  return { workspace, userData }
}

export type CreateWorkspaceResult = Awaited<ReturnType<typeof createWorkspace>>
