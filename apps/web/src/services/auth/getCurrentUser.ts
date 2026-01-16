import { cache } from 'react'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { WorkspacesRepository } from '@latitude-data/core/repositories'

import { getDataFromSession, getPlanFromSubscriptionSlug } from '$/data-access'
import { Session } from 'lucia'

import { notFound, redirect } from 'next/navigation'
import { ROUTES } from '../routes'
import { getCurrentUrl } from './getCurrentUrl'
import { getSession } from './getSession'
import { replaceSession } from './replaceSession'

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

  const requestedWorkspaceId = getWorkspaceIdFromUrl(currentUrl)
  if (
    requestedWorkspaceId &&
    requestedWorkspaceId !== sessionData.session.currentWorkspaceId
  ) {
    const workspacesScope = new WorkspacesRepository(user.id)
    const requestedWorkspaceResult =
      await workspacesScope.find(requestedWorkspaceId)

    if (requestedWorkspaceResult.ok && requestedWorkspaceResult.value) {
      const requestedWorkspace = requestedWorkspaceResult.unwrap()

      try {
        const newSession = await replaceSession({
          sessionData: { user, workspace: requestedWorkspace },
        })

        return {
          session: newSession,
          user,
          workspace: requestedWorkspace,
          subscriptionPlan: getPlanFromSubscriptionSlug(
            requestedWorkspace.currentSubscription.plan,
          ),
        }
      } catch {
        // If session replacement fails, continue with original session
      }
    }
  }

  return {
    session: sessionData.session!,
    user,
    workspace,
    subscriptionPlan,
  }
})

const getWorkspaceIdFromUrl = (currentUrl?: string) => {
  if (!currentUrl) return

  try {
    const url = new URL(currentUrl, 'http://localhost')
    const workspaceId = url.searchParams.get('workspaceId')
    if (!workspaceId) return
    const parsedWorkspaceId = Number(workspaceId)
    if (!Number.isInteger(parsedWorkspaceId) || parsedWorkspaceId <= 0) {
      return
    }

    return parsedWorkspaceId
  } catch {
    return
  }
}
