import { ReactNode } from 'react'

import { SessionProvider } from '@latitude-data/web-ui'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import { BackofficeTabs } from './_components/BackofficeTabs'

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const data = await getSession()
  if (!data.session) redirect(ROUTES.root)

  const { user } = await getCurrentUser()
  if (!user?.admin) redirect(ROUTES.root)

  return (
    <SessionProvider currentUser={user}>
      <BackofficeTabs>{children}</BackofficeTabs>
    </SessionProvider>
  )
}
