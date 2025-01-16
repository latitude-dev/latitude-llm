import { cache } from 'react'

import { User, Workspace } from '@latitude-data/core/browser'
import {
  getCurrentUserFromDB,
  unsafelyGetCurrentUserFromDb,
} from '$/data-access'
import { Session } from 'lucia'

import { getSession } from './getSession'

export type SessionData = {
  session: Session
  user: User
  workspace: Workspace
}

/**
 * This method is used in places where session has been already checked
 * An example of it are inner `app/(private)` routes. Session was check in main
 * layout. We don't want to throw a not found error if session is not present
 */
export const getCurrentUser = cache(async () => {
  const sessionData = await getSession()
  const { user, workspace, subscriptionPlan } =
    await unsafelyGetCurrentUserFromDb({
      userId: sessionData?.user?.id,
    })

  return {
    session: sessionData.session!,
    user: user!,
    workspace: workspace!,
    subscriptionPlan,
  }
})

/**
 * This method is used in places where session has to be check
 * If something is not present it will throw an error
 */
export const getCurrentUserOrError = cache(async () => {
  const sessionData = await getSession()
  const result = await getCurrentUserFromDB({ userId: sessionData?.user?.id })
  const { user, workspace } = result.unwrap()

  return {
    session: sessionData.session!,
    user,
    workspace,
  }
})
