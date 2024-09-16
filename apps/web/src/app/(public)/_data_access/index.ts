import { cache } from 'react'

import {
  unsafelyFindMembershipByToken,
  unsafelyFindWorkspace,
  unsafelyGetUser,
} from '@latitude-data/core/data-access'

export const findMembershipByTokenCache = cache(async (token: string) => {
  return await unsafelyFindMembershipByToken(token).then((r) => r.unwrap())
})

export const findWorkspaceCache = cache(async (id: number) => {
  return await unsafelyFindWorkspace(id)
})

export const findUserCache = cache(async (id: string) => {
  return await unsafelyGetUser(id)
})
