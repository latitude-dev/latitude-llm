'use server'

import { verifyWebsocketToken } from '@latitude-data/core/websockets/utils'
import { setWebsocketSessionCookie } from '$/services/auth/setSession'
import { cookies } from 'next/headers'

import { authProcedure } from '../procedures'

export const refreshWebsocketTokenAction = authProcedure.action(
  async ({ ctx: { user, workspace } }) => {
    const cks = await cookies()
    const refreshWebsocketCookie = cks.get('websocketRefresh')
    const refreshToken = refreshWebsocketCookie?.value
    const result = await verifyWebsocketToken({
      token: refreshToken,
      type: 'websocket',
    })

    if (!result.error) return { success: true }

    await setWebsocketSessionCookie({
      name: 'websocket',
      sessionData: { user: { id: user.id }, workspace: { id: workspace.id } },
    })
    await setWebsocketSessionCookie({
      name: 'websocketRefresh',
      sessionData: { user: { id: user.id }, workspace: { id: workspace.id } },
    })

    return { success: true }
  },
)
