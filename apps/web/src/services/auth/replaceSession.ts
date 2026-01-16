import { lucia } from '.'
import { setWebsocketSessionCookie } from './setSession'
import { SessionData } from './getCurrentUser'
import { cookies } from 'next/headers'

type PartialSession = Omit<SessionData, 'session'>

/**
 * Creates a new session for a different workspace.
 * Note: We intentionally do NOT invalidate the old session here because
 * other code in the same request may still need to validate the session
 * using the request cookie (which still has the old session ID).
 * The old session will become orphaned once the browser receives the new cookie.
 */
export async function replaceSession({
  sessionData,
}: {
  sessionData: PartialSession
}) {
  const cks = await cookies()

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

  return session
}
