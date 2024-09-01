import { ReactNode } from 'react'

import { SessionProvider } from '@latitude-data/web-ui/browser'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const data = await getSession()
  if (!data.session) return redirect(ROUTES.auth.login)

  const { workspace, user } = await getCurrentUser()

  return (
    <SessionProvider currentUser={user} workspace={workspace}>
      {children}
    </SessionProvider>
  )
}
