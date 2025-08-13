import { ReactNode } from 'react'

import buildMetatags from '$/app/_lib/buildMetatags'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { SessionProvider } from '@latitude-data/web-ui/providers'
import { notFound } from 'next/navigation'

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
  if (!user?.admin) {
    return notFound()
  }

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
