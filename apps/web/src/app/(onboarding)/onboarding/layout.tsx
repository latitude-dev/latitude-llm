'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ReactNode } from 'react'
import { env } from '@latitude-data/env'
import NocodersHeader from './_components/NocodersHeader'

export default async function NocodersLayout({
  children,
}: {
  children: ReactNode
}) {
  const { workspace, user } = await getCurrentUserOrRedirect()
  const isCloud = !!env.LATITUDE_CLOUD

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <div className={'flex flex-col h-screen overflow-hidden relative'}>
          <NocodersHeader currentUser={user} isCloud={isCloud} />
          {children}
        </div>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
