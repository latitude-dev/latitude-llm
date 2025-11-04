import { ReactNode } from 'react'

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

import { CSPostHogProvider, IdentifyUser } from '../providers'
import { PaywallModalProvider } from './providers/PaywallModalProvider'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { Result } from '@latitude-data/core/lib/Result'

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

  const datasetOnboardingEnabledResult = await isFeatureEnabledByName(
    workspace.id,
    'datasetOnboarding',
  )
  if (!Result.isOk(datasetOnboardingEnabledResult)) {
    redirect(ROUTES.dashboard.root)
  }
  const isDatasetOnboardingEnabled = datasetOnboardingEnabledResult.unwrap()

  if (!completed) {
    if (isDatasetOnboardingEnabled) {
      redirect(ROUTES.onboarding.dataset.pasteYourPrompt)
    }
    redirect(ROUTES.onboarding.agents.selectAgent)
  }

  const supportIdentity = createSupportUserIdentity(user)
  const cloudInfo = env.LATITUDE_CLOUD_PAYMENT_URL
    ? { paymentUrl: env.LATITUDE_CLOUD_PAYMENT_URL }
    : undefined
  const isCloud = !!env.LATITUDE_CLOUD

  return (
    <CSPostHogProvider>
      <IdentifyUser
        user={user}
        workspace={workspace}
        subscription={subscriptionPlan}
      >
        <IntercomProvider identity={supportIdentity}>
          <SocketIOProvider>
            <SessionProvider
              currentUser={user}
              workspace={workspace}
              subscriptionPlan={subscriptionPlan}
            >
              <LatitudeWebsocketsProvider
                workspace={workspace}
                socketServer={env.WEBSOCKETS_SERVER}
              >
                <PaywallModalProvider>
                  <AppLayout
                    currentUser={user}
                    cloudInfo={cloudInfo}
                    isCloud={isCloud}
                  >
                    {children}
                  </AppLayout>
                </PaywallModalProvider>
              </LatitudeWebsocketsProvider>
            </SessionProvider>
          </SocketIOProvider>
        </IntercomProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
