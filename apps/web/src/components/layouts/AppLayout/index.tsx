import { ReactNode } from 'react'

import { ROUTES } from '$/services/routes'
import { SessionUser } from '$ui/providers'

import AppHeader, { AppHeaderProps } from './Header'

export type AppLayoutProps = AppHeaderProps & {
  children: ReactNode
  currentUser: SessionUser | undefined
}

export default function AppLayout({
  children,
  currentUser,
  breadcrumbs,
  navigationLinks,
  sectionLinks = [
    { label: 'Projects', href: ROUTES.projects.root },
    { label: 'Settings', href: ROUTES.settings.root },
  ],
}: AppLayoutProps) {
  return (
    <div className='flex flex-col h-screen'>
      <AppHeader
        sectionLinks={sectionLinks}
        breadcrumbs={breadcrumbs}
        navigationLinks={navigationLinks}
        currentUser={currentUser}
      />
      <main className='flex flex-row w-full h-full'>{children}</main>
    </div>
  )
}
