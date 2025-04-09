import { type TokenType } from '@latitude-data/core/websockets/constants'
import { generateWebsocketToken } from '@latitude-data/core/websockets/utils'
import { cookies } from 'next/headers'

import { lucia } from '.'
import { SessionData } from './getCurrentUser'
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

type PartialSession = Omit<SessionData, 'session'>
export async function setWebsocketSessionCookie({
  name,
  sessionData,
}: {
  name: TokenType
  sessionData: PartialSession
}) {
  const cks = await cookies()
  const { token, cookiesOptions } = await generateWebsocketToken({
    name,
    payload: {
      userId: sessionData.user.id,
      workspaceId: sessionData.workspace.id,
    },
  })
  cks.set(name, token, {
    ...cookiesOptions,
    httpOnly: true,
    sameSite: 'lax',
  })
}

export async function setSession(
  {
    sessionData: { workspace, user },
  }: {
    sessionData: PartialSession
  },
  cks?: ReadonlyRequestCookies,
) {
  const session = await lucia.createSession(user.id, {
    currentWorkspaceId: workspace.id,
  })
  const sessionCookie = lucia.createSessionCookie(session.id)
  cks = cks ?? (await cookies())

  console.log(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
  cks.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)

  setWebsocketSessionCookie({
    name: 'websocket',
    sessionData: { user, workspace },
  })
  setWebsocketSessionCookie({
    name: 'websocketRefresh',
    sessionData: { user, workspace },
  })
}
