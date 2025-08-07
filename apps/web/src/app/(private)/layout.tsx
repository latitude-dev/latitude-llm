import type { ReactNode } from 'react'

import { createSupportUserIdentity } from '$/app/(private)/_lib/createSupportUserIdentity'
import buildMetatags from '$/app/_lib/buildMetatags'
import { IntercomProvider } from '$/components/IntercomSupportChat'
import { AppLayout } from '$/components/layouts'
import {
  LatitudeWebsocketsProvider,
  SocketIOProvider,
} from '$/components/Providers/WebsocketsProvider'
import { isOnboardingCompleted } from '$/data-access/workspaceOnboarding'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { env } from '@latitude-data/env'
import { SessionProvider } from '@latitude-data/web-ui/browser'
import { redirect } from 'next/navigation'

import { FeatureFlagProvider } from '$/components/Providers/FeatureFlags'
import { getFeatureFlagsForWorkspaceCached } from '$/components/Providers/FeatureFlags/getFeatureFlagsForWorkspace'
import { CSPostHogProvider, IdentifyUser } from '../providers'
import { NAV_LINKS } from './_lib/constants'

export const metadata = buildMetatags({
  title: 'Home',
  locationDescription: 'The Latitude App',
})

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const { workspace, user, subscriptionPlan } = await getCurrentUserOrRedirect()

  const completed = await isOnboardingCompleted()
  if (!completed) redirect(ROUTES.onboarding.root)

  const supportIdentity = createSupportUserIdentity(user)
  const featureFlags = getFeatureFlagsForWorkspaceCached({ workspace })
  const cloudInfo = env.LATITUDE_CLOUD_PAYMENT_URL
    ? { paymentUrl: env.LATITUDE_CLOUD_PAYMENT_URL }
    : undefined
  const isCloud = !!env.LATITUDE_CLOUD

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <IntercomProvider identity={supportIdentity}>
          <SocketIOProvider>
            <SessionProvider
              currentUser={user}
              workspace={workspace}
              subscriptionPlan={subscriptionPlan}
            >
              <FeatureFlagProvider featureFlags={featureFlags}>
                <LatitudeWebsocketsProvider
                  workspace={workspace}
                  socketServer={env.WEBSOCKETS_SERVER}
                >
                  <AppLayout
                    currentUser={user}
                    navigationLinks={NAV_LINKS}
                    cloudInfo={cloudInfo}
                    isCloud={isCloud}
                  >
                    {children}
                  </AppLayout>
                </LatitudeWebsocketsProvider>
              </FeatureFlagProvider>
            </SessionProvider>
          </SocketIOProvider>
        </IntercomProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
