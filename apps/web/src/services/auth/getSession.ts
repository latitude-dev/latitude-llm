import type { Session, User } from 'lucia'
import { cookies } from 'next/headers'

import { lucia } from '.'

export async function getSession(): Promise<
  { user: User; session: Session } | { user: null; session: null }
> {
  const cks = await cookies()
  const sessionId = cks.get(lucia.sessionCookieName)?.value ?? null
  if (!sessionId) {
    return {
      user: null,
      session: null,
    }
  }

  const result = await lucia.validateSession(sessionId)

  try {
    if (result.session?.fresh) {
      const sessionCookie = lucia.createSessionCookie(result.session.id)
      await cks.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
    }

    if (!result.session) {
      const sessionCookie = lucia.createBlankSessionCookie()

      await cks.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
    }
  } catch {
    // ignore
    // next.js throws when you attempt to set cookie when rendering page
  }

  return result
}
