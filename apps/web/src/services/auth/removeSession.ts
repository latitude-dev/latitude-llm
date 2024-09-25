import { Session } from 'lucia'
import { cookies } from 'next/headers'

import { lucia } from '.'

export async function removeSession({ session }: { session: Session }) {
  await lucia.invalidateSession(session.id)
  const sessionCookie = lucia.createBlankSessionCookie()
  cookies().set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.attributes,
  )
}
