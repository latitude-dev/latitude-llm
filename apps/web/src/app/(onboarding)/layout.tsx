'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ReactNode } from 'react'

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const { workspace, user } = await getCurrentUserOrRedirect()

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        {children}
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
