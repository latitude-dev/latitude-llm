'use server'

import { type TokenType } from '@latitude-data/core/websockets/constants'
import { authProcedure } from '$/actions/procedures'
import { removeSession } from '$/services/auth/removeSession'
import { ROUTES } from '$/services/routes'
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import { redirect } from 'next/navigation'

function removeSocketCookie({
  name,
  cookies,
}: {
  name: TokenType
  cookies: ReadonlyRequestCookies
}) {
  cookies.delete(name)
}

export const logoutAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    removeSession({ session: ctx.session })
    const { cookies: getCookies } = await import('next/headers')

    const cookies = getCookies()
    removeSocketCookie({ name: 'websocket', cookies })
    removeSocketCookie({ name: 'websocketRefresh', cookies })

    redirect(ROUTES.auth.login)
  })
