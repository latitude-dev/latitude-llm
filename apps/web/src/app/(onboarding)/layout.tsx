'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ReactNode } from 'react'
import { WorkspaceProvider } from '../providers/WorkspaceProvider'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { isOnboardingCompleted } from '$/data-access'

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const { workspace, user, subscriptionPlan } = await getCurrentUserOrRedirect()
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }

  return (
    <CSPostHogProvider>
      <IdentifyUser
        user={user}
        workspace={workspace}
        subscription={subscriptionPlan}
      >
        <WorkspaceProvider workspace={workspace}>{children}</WorkspaceProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
