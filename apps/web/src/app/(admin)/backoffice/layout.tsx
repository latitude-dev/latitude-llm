import { ReactNode } from 'react'

import { SessionProvider } from '@latitude-data/web-ui/providers'
import buildMetatags from '$/app/_lib/buildMetatags'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import { BackofficeTabs } from './_components/BackofficeTabs'

export const metadata = buildMetatags({
  title: 'Backoffice',
})

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const { user, workspace, subscriptionPlan } = await getCurrentUserOrRedirect()
  if (!user?.admin) redirect(ROUTES.root)

  return (
    <SessionProvider
      currentUser={user}
      workspace={workspace}
      subscriptionPlan={subscriptionPlan}
    >
      <BackofficeTabs>{children}</BackofficeTabs>
    </SessionProvider>
  )
}
