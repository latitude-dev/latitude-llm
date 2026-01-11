import { type TokenType } from '@latitude-data/core/websockets/constants'
import { generateWebsocketToken } from '@latitude-data/core/websockets/utils'
import { cookies } from 'next/headers'

import { lucia } from '.'
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

export async function setWebsocketSessionCookie(
  {
    name,
    sessionData,
  }: {
    name: TokenType
    sessionData: { user: { id: string }; workspace: { id: number } }
  },
  cks?: ReadonlyRequestCookies,
) {
  cks = cks ?? (await cookies())
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
    sessionData: { user: { id: string; email: string }; workspace: any }
  },
  cks?: ReadonlyRequestCookies,
) {
  const session = await lucia.createSession(user.id, {
    currentWorkspaceId: workspace.id,
  })
  const sessionCookie = lucia.createSessionCookie(session.id)
  cks = cks ?? (await cookies())

  cks.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)

  await Promise.all([
    setWebsocketSessionCookie(
      {
        name: 'websocket',
        sessionData: { user: { id: user.id }, workspace: { id: workspace.id } },
      },
      cks,
    ),
    setWebsocketSessionCookie(
      {
        name: 'websocketRefresh',
        sessionData: { user: { id: user.id }, workspace: { id: workspace.id } },
      },
      cks,
    ),
  ])
}
