import { ReactNode } from 'react'

import { SessionProvider } from '@latitude-data/web-ui/browser'
import { createSupportUserIdentity } from '$/app/(private)/_lib/createSupportUserIdentity'
import { SupportChat } from '$/components/IntercomSupportChat'
import { AppLayout } from '$/components/layouts'
import {
  LatitudeWebsocketsProvider,
  SocketIOProvider,
} from '$/components/Providers/WebsocketsProvider'
import env from '$/env'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import { CSPostHogProvider, IdentifyUser } from '../providers'
import { NAV_LINKS } from './_lib/constants'

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const data = await getSession()
  if (!data.session) return redirect(ROUTES.auth.login)

  const { workspace, user } = await getCurrentUser()
  const supportIdentity = createSupportUserIdentity(user)

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <SupportChat identity={supportIdentity} />
        <SocketIOProvider>
          <SessionProvider currentUser={user} workspace={workspace}>
            <LatitudeWebsocketsProvider socketServer={env.WEBSOCKETS_SERVER}>
              <AppLayout currentUser={user} navigationLinks={NAV_LINKS}>
                {children}
              </AppLayout>
            </LatitudeWebsocketsProvider>
          </SessionProvider>
        </SocketIOProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
