import type { ReactNode } from 'react'

import { getDataFromSession } from '$/data-access'
import { MaybeSessionProvider } from '$/components/Providers/MaybeSessionProvider'

/**
 * This layout is here only to add providers.
 * Don't put any DIVs or other HTML elements here.
 * Public pages are very different between each other.
 */
export default async function PublicLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const { user } = await getDataFromSession()

  return (
    <MaybeSessionProvider currentUser={user}>{children}</MaybeSessionProvider>
  )
}
