'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ReactNode } from 'react'
import { WorkspaceProvider } from '../providers/WorkspaceProvider'

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const { workspace, user } = await getCurrentUserOrRedirect()

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <WorkspaceProvider workspace={workspace}>{children}</WorkspaceProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
