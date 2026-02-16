'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { GoogleTagManager } from '$/components/Providers/GoogleTagManager'
import {
  LatitudeWebsocketsProvider,
  SocketIOProvider,
} from '$/components/Providers/WebsocketsProvider'
import { SessionProvider } from '$/components/Providers/SessionProvider'
import { isOnboardingCompleted } from '$/data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { computeProductAccess } from '@latitude-data/core/services/productAccess/computeProductAccess'
import { env } from '@latitude-data/env'
import { ReactNode } from 'react'
import { WorkspaceProvider } from '../providers/WorkspaceProvider'
import OnboardingGuard from './_lib/OnboardingGuard'

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const { workspace, user, subscriptionPlan } = await getCurrentUserOrRedirect()
  const isCompleted = await isOnboardingCompleted()
  const productAccess = computeProductAccess(workspace)

  return (
    <>
      <GoogleTagManager />
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
              subscriptionPlan={subscriptionPlan}
              productAccess={productAccess}
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
    </>
  )
}
