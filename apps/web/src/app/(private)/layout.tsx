import { ReactNode } from 'react'

import { SessionProvider } from '@latitude-data/web-ui/browser'
import buildMetatags from '$/app/_lib/buildMetatags'
import { createSupportUserIdentity } from '$/app/(private)/_lib/createSupportUserIdentity'
import { SupportChat } from '$/components/IntercomSupportChat'
import { AppLayout } from '$/components/layouts'
import {
  LatitudeWebsocketsProvider,
  SocketIOProvider,
} from '$/components/Providers/WebsocketsProvider'
import { env } from '@latitude-data/env'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { isOnboardingCompleted } from '$/data-access/workspaceOnboarding'

import { CSPostHogProvider, IdentifyUser } from '../providers'
import { NAV_LINKS } from './_lib/constants'
import { FeatureFlagProvider } from '$/components/Providers/FeatureFlags'
import { getFeatureFlagsForWorkspaceCached } from '$/components/Providers/FeatureFlags/getFeatureFlagsForWorkspace'
import { FEATURE_FLAGS, ResolvedFeatureFlags } from '$/components/Providers/FeatureFlags/flags'

export const metadata = buildMetatags({
  title: 'Home',
})

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const data = await getSession()
  if (!data.session) return redirect(ROUTES.auth.login)

  const { workspace, user, subscriptionPlan } = await getCurrentUser()
  if (!user) return redirect(ROUTES.auth.login)

  const completed = await isOnboardingCompleted()
  if (!completed) {
    redirect(ROUTES.onboarding.root)
  }

  const supportIdentity = createSupportUserIdentity(user)
  const workspaceFeatureFlags = getFeatureFlagsForWorkspaceCached({ workspace })
  
  const allFeatureFlags: ResolvedFeatureFlags = {
    ...workspaceFeatureFlags,
    [FEATURE_FLAGS.inviteOnly]: { enabled: env.INVITE_ONLY === true },
    // Ensure all flags from FEATURE_FLAGS are present.
    // If getFeatureFlagsForWorkspaceCached doesn't return all conditional flags
    // (e.g., if a new one was added to FEATURE_FLAGS but not FEATURE_FLAGS_CONDITIONS),
    // we might need to provide defaults here too, similar to the root layout.
    // However, getFeatureFlagsForWorkspaceCached iterates Object.keys(FEATURE_FLAGS_CONDITIONS),
    // so it should cover all conditional flags it's aware of.
  }

  const cloudInfo = env.LATITUDE_CLOUD_PAYMENT_URL
    ? { paymentUrl: env.LATITUDE_CLOUD_PAYMENT_URL }
    : undefined

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <SupportChat identity={supportIdentity} />
        <SocketIOProvider>
          <SessionProvider
            currentUser={user}
            workspace={workspace}
            subscriptionPlan={subscriptionPlan}
          >
            <FeatureFlagProvider featureFlags={allFeatureFlags}>
              <LatitudeWebsocketsProvider
                workspace={workspace}
                socketServer={env.WEBSOCKETS_SERVER}
              >
                <AppLayout
                  currentUser={user}
                  navigationLinks={NAV_LINKS}
                  cloudInfo={cloudInfo}
                >
                  {children}
                </AppLayout>
              </LatitudeWebsocketsProvider>
            </FeatureFlagProvider>
          </SessionProvider>
        </SocketIOProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
