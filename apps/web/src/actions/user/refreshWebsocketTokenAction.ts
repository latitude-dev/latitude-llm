'use server'

import { setWebsocketSessionCookie } from '$/services/auth/setSession'
import { verifyWebsocketToken } from '@latitude-data/core/websockets/utils'
import { cookies } from 'next/headers'

import { authProcedure } from '../procedures'

export const refreshWebesocketTokenAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx: { user, workspace } }) => {
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
      sessionData: { user, workspace },
    })
    await setWebsocketSessionCookie({
      name: 'websocketRefresh',
      sessionData: { user, workspace },
    })

    return { success: true }
  })
