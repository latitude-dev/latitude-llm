import { Session } from 'lucia'
import { cookies } from 'next/headers'

import { lucia } from '.'

export async function removeSession({ session }: { session: Session }) {
  await lucia.invalidateSession(session.id)
  const sessionCookie = lucia.createBlankSessionCookie()
  const cks = await cookies()

  cks.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
}
