import { ReactNode } from 'react'

import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import { NAV_LINKS } from '../_lib/constants'

export default async function Layout({ children }: { children: ReactNode }) {
  const session = await getCurrentUser()
  const sectionLinks = [
    { label: 'Projects', href: ROUTES.dashboard.root },
    { label: 'Evaluations', href: ROUTES.evaluations.root },
    { label: 'Settings', href: ROUTES.settings.root },
  ]
  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={[{ name: session.workspace.name }, { name: 'Evaluations' }]}
      sectionLinks={sectionLinks}
    >
      {children}
    </AppLayout>
  )
}
