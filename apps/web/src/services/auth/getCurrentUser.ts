import { cache } from 'react'

import { Workspace } from '@latitude-data/core/browser'
import { getDataFromSession } from '$/data-access'
import { Session } from 'lucia'

import { getSession } from './getSession'
import { redirect } from 'next/navigation'
import { ROUTES } from '../routes'

export type SessionData = {
  session: Session
  user: {
    id: string
    email: string
  }
  workspace: Workspace
  impersonating?: true
}

/**
 * Gets the current authenticated user and workspace data, or redirects to login if not authenticated.
 *
 * This function is cached using React's cache() to avoid repeated database calls during the same request.
 * It performs the following checks:
 * 1. Verifies that a valid session exists
 * 2. Retrieves user and workspace data from the session
 * 3. Redirects to login page if any authentication data is missing
 *
 * @returns Promise<SessionData> - The authenticated user's session data including user, workspace, and subscription plan
 * @throws {never} - This function never throws, it redirects instead
 */
export const getCurrentUserOrRedirect = cache(async () => {
  const sessionData = await getSession()
  if (!sessionData?.session) {
    return redirect(ROUTES.auth.login)
  }

  const { user, workspace, subscriptionPlan } = await getDataFromSession(
    sessionData.session,
  )
  if (!workspace) return redirect(ROUTES.auth.login)
  if (!user) return redirect(ROUTES.auth.login)

  return {
    session: sessionData.session!,
    user,
    workspace,
    subscriptionPlan,
  }
})
