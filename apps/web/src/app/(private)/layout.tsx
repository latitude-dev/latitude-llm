import { ReactNode } from 'react'

import { createSupportUserIdentity } from '$/app/(private)/_lib/createSupportUserIdentity'
import { getFirstProjectCached } from '$/app/(private)/_data-access'
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
import { redirect } from 'next/navigation'
import { HEAD_COMMIT, RunSourceGroup } from '@latitude-data/core/constants'

import { CSPostHogProvider, IdentifyUser } from '../providers'
import { PaywallModalProvider } from './providers/PaywallModalProvider'
import { SessionProvider } from '$/components/Providers/SessionProvider'
import { getCurrentUrl } from '$/services/auth/getCurrentUrl'

export const metadata = buildMetatags({
  title: 'Home',
  locationDescription: 'The Latitude App',
})

export default async function PrivateLayout({
  children,
  modal,
}: Readonly<{
  children: ReactNode
  modal: ReactNode
}>) {
  const {
    workspace,
    user,
    subscriptionPlan,
    membership,
    workspacePermissions,
  } = await getCurrentUserOrRedirect()

  const currentUrl = await getCurrentUrl()
  const isAnnotationsPath = currentUrl?.includes('/annotations')

  if (membership.role === 'annotator' && !isAnnotationsPath) {
    let project: Awaited<ReturnType<typeof getFirstProjectCached>> | null = null
    try {
      project = await getFirstProjectCached({ workspaceId: workspace.id })
    } catch {
      project = null
    }

    if (project) {
      const annotationsUrl = ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: HEAD_COMMIT })
        .annotations.root({ sourceGroup: RunSourceGroup.Production })

      redirect(annotationsUrl)
    }

    redirect(ROUTES.root)
  }

  const completed = await isOnboardingCompleted()

  if (!completed) {
    redirect(ROUTES.onboarding.root)
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
              membership={membership}
              workspacePermissions={workspacePermissions}
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
                    {modal}
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
