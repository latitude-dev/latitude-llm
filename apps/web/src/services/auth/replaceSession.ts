import { Session as LuciaSession } from 'lucia'

import { lucia } from '.'
import { setWebsocketSessionCookie } from './setSession'
import { SessionData } from './getCurrentUser'
import { cookies } from 'next/headers'

type PartialSession = Omit<SessionData, 'session'>

/**
 * Replaces the current session with a new one in a single operation.
 * This invalidates the old session and creates a new one without setting
 * an intermediate blank cookie.
 */
export async function replaceSession({
  oldSession,
  sessionData,
}: {
  oldSession: LuciaSession
  sessionData: PartialSession
}) {
  const cks = await cookies()

  await lucia.invalidateSession(oldSession.id)

  const { workspace, user } = sessionData
  const session = await lucia.createSession(user.id, {
    currentWorkspaceId: workspace.id,
  })
  const sessionCookie = lucia.createSessionCookie(session.id)

  cks.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)

  await Promise.all([
    setWebsocketSessionCookie(
      {
        name: 'websocket',
        sessionData: { user, workspace },
      },
      cks,
    ),
    setWebsocketSessionCookie(
      {
        name: 'websocketRefresh',
        sessionData: { user, workspace },
      },
      cks,
    ),
  ])
}
