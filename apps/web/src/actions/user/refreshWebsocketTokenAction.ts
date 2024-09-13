'use server'

import { verifyWebsocketToken } from '@latitude-data/core/websockets/utils'
import { setWebsocketSessionCookie } from '$/services/auth/setSession'

import { authProcedure } from '../procedures'

export const refreshWebesocketTokenAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx: { user, workspace } }) => {
    const { cookies } = await import('next/headers')
    const refreshWebsocketCookie = cookies().get('websocketRefresh')
    const refreshToken = refreshWebsocketCookie?.value
    const result = await verifyWebsocketToken({
      token: refreshToken,
      type: 'websocket',
    })

    if (!result.error) return { success: true }

    await setWebsocketSessionCookie({
      name: 'websocket',
      sessionData: { user, workspace },
    })
    await setWebsocketSessionCookie({
      name: 'websocketRefresh',
      sessionData: { user, workspace },
    })

    return { success: true }
  })
