import { cache } from 'react'

import { getDataFromSession } from '$/data-access'
import { Workspace } from '@latitude-data/core/browser'
import { Session } from 'lucia'

import { notFound, redirect } from 'next/navigation'
import { ROUTES } from '../routes'
import { getCurrentUrl } from './getCurrentUrl'
import { getSession } from './getSession'

export type SessionData = {
  session: Session
  user: {
    id: string
    email: string
  }
  workspace: Workspace
  impersonating?: true
}

function redirectToLogin(currentUrl?: string) {
  if (!currentUrl) {
    return redirect(ROUTES.auth.login)
  }

  // Note: this should never happen because getCurrentUserOrRedirect should not be used in the login page
  if (currentUrl.includes(ROUTES.auth.login)) {
    return notFound()
  }

  return redirect(
    `${ROUTES.auth.login}?returnTo=${encodeURIComponent(currentUrl)}`,
  )
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
  const currentUrl = await getCurrentUrl()

  const sessionData = await getSession()
  if (!sessionData?.session) {
    return redirectToLogin(currentUrl)
  }

  const { user, workspace, subscriptionPlan } = await getDataFromSession(
    sessionData.session,
  )
  if (!user || !workspace) {
    return redirectToLogin(currentUrl)
  }

  return {
    session: sessionData.session!,
    user,
    workspace,
    subscriptionPlan,
  }
})
