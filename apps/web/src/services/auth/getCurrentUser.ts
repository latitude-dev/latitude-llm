import { cache } from 'react'

import { User, Workspace } from '@latitude-data/core/browser'
import { getCurrentUserFromDB } from '$/data-access'
import { Session } from 'lucia'
import { redirect } from 'next/navigation'

import { ROUTES } from '../routes'
import { getSession } from './getSession'

export type SessionData = {
  session: Session
  user: User
  workspace: Workspace
}
export const getCurrentUser = cache(async () => {
  const sessionData = await getSession()
  if (!sessionData.session) {
    return redirect(ROUTES.auth.login)
  }

  const result = await getCurrentUserFromDB({ userId: sessionData?.user?.id })
  if (!result.ok) return redirect(ROUTES.auth.login)

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
