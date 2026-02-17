import { cache } from 'react'

import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { unsafelyFindUserById } from '@latitude-data/core/queries/users/findById'
import { unsafelyFindMembershipByToken } from '@latitude-data/core/data-access/memberships'

export const findMembershipByTokenCache = cache(async (token: string) => {
  return await unsafelyFindMembershipByToken(token).then((r) => r.unwrap())
})

export const findWorkspaceCache = cache(async (id: number) => {
  return await unsafelyFindWorkspace(id)
})

export const findUserCache = cache(async (id: string) => {
  return await unsafelyFindUserById({ id })
})
