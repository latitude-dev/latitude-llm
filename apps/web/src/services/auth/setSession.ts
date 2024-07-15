import { SessionData } from '@latitude-data/core'
import { cookies } from 'next/headers'

import { lucia } from '.'

export async function setSession({
  sessionData: { workspace, user },
}: {
  sessionData: SessionData
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
