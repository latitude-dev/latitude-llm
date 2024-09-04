import { ReactNode } from 'react'

import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { MAIN_NAV_LINKS, NAV_LINKS } from '../_lib/constants'

export default async function Layout({ children }: { children: ReactNode }) {
  const session = await getCurrentUser()
  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={[{ name: session.workspace.name }, { name: 'Evaluations' }]}
      sectionLinks={MAIN_NAV_LINKS}
    >
      {children}
    </AppLayout>
  )
}
