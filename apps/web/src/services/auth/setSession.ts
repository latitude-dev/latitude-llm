import { cookies } from 'next/headers'

import { lucia } from '.'
import { SessionData } from './getCurrentUser'

export async function setSession({
  sessionData: { workspace, user },
}: {
  sessionData: Omit<SessionData, 'session'>
}) {
  const session = await lucia.createSession(user.id, {
    currentWorkspaceId: workspace.id,
  })
  const sessionCookie = lucia.createSessionCookie(session.id)

  cookies().set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.attributes,
  )
}
