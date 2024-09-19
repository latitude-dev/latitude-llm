import { ReactNode } from 'react'

import { SessionProvider } from '@latitude-data/web-ui/browser'
import {
  LatitudeWebsocketsProvider,
  SocketIOProvider,
} from '$/components/Providers/WebsocketsProvider'
import env from '$/env'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import { CSPostHogProvider } from '../providers'

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const data = await getSession()
  if (!data.session) return redirect(ROUTES.auth.login)

  const { workspace, user } = await getCurrentUser()

  return (
    <CSPostHogProvider>
      <SocketIOProvider>
        <SessionProvider currentUser={user} workspace={workspace}>
          <LatitudeWebsocketsProvider socketServer={env.WEBSOCKETS_SERVER}>
            {children}
          </LatitudeWebsocketsProvider>
        </SessionProvider>
      </SocketIOProvider>
    </CSPostHogProvider>
  )
}
