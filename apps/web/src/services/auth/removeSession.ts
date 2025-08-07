import type { Session as LuciaSession } from 'lucia'
import type { TokenType } from '@latitude-data/core/websockets/constants'
import { cookies } from 'next/headers'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

import { lucia } from '.'

function removeSocketCookie({
  name,
  cookies,
}: {
  name: TokenType
  cookies: ReadonlyRequestCookies
}) {
  cookies.delete(name)
}

export async function removeSession({ session }: { session: Session }) {
  await lucia.invalidateSession(session.id)
  const sessionCookie = lucia.createBlankSessionCookie()
  const cks = await cookies()

  cks.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
  removeSocketCookie({ name: 'websocket', cookies: cks })
  removeSocketCookie({ name: 'websocketRefresh', cookies: cks })
}

export type Session = LuciaSession
