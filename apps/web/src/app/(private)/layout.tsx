import { ReactNode } from 'react'

import { getSession } from '$/lib/auth/getSession'
import { ROUTES } from '$/lib/routes'
import { redirect } from 'next/navigation'

export default async function PrivateLayout({
  children,
}: {
  children: ReactNode
}) {
  const data = await getSession()
  if (!data.session) {
    return redirect(ROUTES.auth.login)
  }
  return <>{children}</>
}
