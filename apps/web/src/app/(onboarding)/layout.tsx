'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ReactNode } from 'react'
import { WorkspaceProvider } from '../providers/WorkspaceProvider'
import { isOnboardingCompleted } from '$/data-access'
import OnboardingGuard from './_lib/OnboardingGuard'

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const { workspace, user, subscriptionPlan } = await getCurrentUserOrRedirect()
  const isCompleted = await isOnboardingCompleted()

  return (
    <CSPostHogProvider>
      <IdentifyUser
        user={user}
        workspace={workspace}
        subscription={subscriptionPlan}
      >
        <WorkspaceProvider workspace={workspace}>
          <OnboardingGuard isOnboardingCompleted={isCompleted}>
            {children}
          </OnboardingGuard>
        </WorkspaceProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
