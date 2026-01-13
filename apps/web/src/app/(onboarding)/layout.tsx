'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ReactNode } from 'react'
import { WorkspaceProvider } from '../providers/WorkspaceProvider'
import { isOnboardingCompleted } from '$/data-access'
import OnboardingGuard from './_lib/OnboardingGuard'
import {
  LatitudeWebsocketsProvider,
  SocketIOProvider,
} from '$/components/Providers/WebsocketsProvider'
import { SessionProvider } from '$/components/Providers/SessionProvider'
import { env } from '@latitude-data/env'

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const {
    workspace,
    user,
    subscriptionPlan,
    membership,
    workspacePermissions,
  } = await getCurrentUserOrRedirect()
  const isCompleted = await isOnboardingCompleted()

  return (
    <CSPostHogProvider>
      <IdentifyUser
        user={user}
        workspace={workspace}
        subscription={subscriptionPlan}
      >
        <SocketIOProvider>
          <SessionProvider
            currentUser={user}
            workspace={workspace}
            membership={membership}
            workspacePermissions={workspacePermissions}
            subscriptionPlan={subscriptionPlan}
          >
            <LatitudeWebsocketsProvider
              workspace={workspace}
              socketServer={env.WEBSOCKETS_SERVER}
            >
              <WorkspaceProvider workspace={workspace}>
                <OnboardingGuard isOnboardingCompleted={isCompleted}>
                  {children}
                </OnboardingGuard>
              </WorkspaceProvider>
            </LatitudeWebsocketsProvider>
          </SessionProvider>
        </SocketIOProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
