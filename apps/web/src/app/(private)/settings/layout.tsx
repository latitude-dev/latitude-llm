import { ReactNode } from 'react'

import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import { getFirstProjectCached } from '../_data-access'
import { NAV_LINKS } from '../_lib/constants'

export default async function Layout({ children }: { children: ReactNode }) {
  const session = await getCurrentUser()
  const project = await getFirstProjectCached({
    workspaceId: session.workspace.id,
  })
  const url = ROUTES.projects.detail({ id: project.id }).root
  const sectionLinks = [
    { label: 'Projects', href: url },
    { label: 'Settings', href: ROUTES.settings.root },
  ]
  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={[{ name: session.workspace.name }, { name: 'Settings' }]}
      sectionLinks={sectionLinks}
    >
      {children}
    </AppLayout>
  )
}
