import { cache } from 'react'

import type { SafeUser } from '@latitude-data/core/browser'
import { getCurrentUserFromDB } from '$/data-access'
import { Session } from 'lucia'

import { getSession } from './getSession'

export type SessionData = {
  session: Session
  user: SafeUser
  workspace: {
    id: number
    name: string
  }
}
export const getCurrentUser = cache(async () => {
  const sessionData = await getSession()
  const result = await getCurrentUserFromDB({ userId: sessionData?.user?.id })
  const { user, workspace } = result.unwrap()

  return {
    session: sessionData.session!,
    user,
    workspace,
  }
})

export const getSafeCurrentUser = cache(async () => {
  const sessionData = await getSession()
  const result = await getCurrentUserFromDB({ userId: sessionData?.user?.id })

  if (result.error) return null

  const { user, workspace } = result.value

  return {
    session: sessionData.session!,
    user,
    workspace,
  }
})
